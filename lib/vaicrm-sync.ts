// Sincronização dos leads da Vai de Vendas (VaiCRM) para o painel.
//
// Desenho:
//  - Lead = contato único (dedupe por telefone normalizado, convivendo com
//    OpaSuite/Leadster — NÃO duplica nem sobrescreve leads de outras origens).
//  - Apenas dados NOVOS daqui para frente: usamos a Setting `vaivendas_last_sync`
//    como marca d'água. Na primeiríssima execução, só estabelecemos a marca
//    (importa 0), respeitando "só daqui pra frente".
//  - Origem/canal: leads VCRM NÃO são 'direto'/'orgânico'. Ou vieram da mídia
//    (canal pago preservado via dedupe com OpaSuite/Leadster) ou via SITE,
//    cuja mídia é 'http' (fallback padrão). Quando o usuário criar tags lá e
//    mapeá-las em `vaivendas_tag_channel_map`, o canal é derivado das tags —
//    aplicado inclusive RETROATIVAMENTE aos leads vaivendas já importados.

import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone-utils'
import {
  fetchContactsSince, fetchChats, contactTagNames, contactTagNamesRaw,
  fetchKanbanContacts, normalizeStageLabel,
  channelFromAdReferral, adInfoFromReferral,
  type VaiCrmContact, type VaiCrmChat,
} from '@/lib/vaicrm'

const LAST_SYNC_KEY = 'vaivendas_last_sync'
const TAG_MAP_KEY = 'vaivendas_tag_channel_map'

export interface VaiCrmSyncResult {
  fetched: number
  created: number
  skippedExisting: number
  invalidPhone: number
  channelUpdated: number
  attendanceUpdated: number
  enrichmentUpdated: number
  since: string
  until: string
  firstRun: boolean
}

/**
 * Atualiza o estado de atendimento (assumido / na fila / encerrado) dos leads
 * da Vai de Vendas a partir dos chats da plataforma. Roda sobre TODOS os leads
 * vaivendas (aplica retroativamente), pois um chat pode ser assumido/encerrado
 * depois que o lead foi importado. Retorna quantos leads tiveram mudança.
 */
export async function updateVaiChatStates(opts: { maxPages?: number } = {}): Promise<number> {
  const chats = await fetchChats({ maxPages: opts.maxPages ?? 30 })
  if (chats.length === 0) return 0

  // Agrupa chats por contato. Mantém o mais recente como representativo e marca
  // "assumido" se QUALQUER chat do contato tiver atendente atribuído.
  const byContact = new Map<string, { latest: VaiCrmChat; assigned: boolean }>()
  for (const ch of chats) {
    if (!ch.contactId) continue
    const assigned = !!(ch.assignedUserId || ch.assignedToId)
    const cur = byContact.get(ch.contactId)
    if (!cur) {
      byContact.set(ch.contactId, { latest: ch, assigned })
    } else {
      const a = new Date(ch.lastActivityAt ?? ch.createdAt).getTime()
      const b = new Date(cur.latest.lastActivityAt ?? cur.latest.createdAt).getTime()
      if (a > b) cur.latest = ch
      cur.assigned = cur.assigned || assigned
    }
  }

  const leads = await prisma.lead.findMany({
    where: { vaicrmContactId: { not: null } },
    select: {
      id: true, vaicrmContactId: true, openedAt: true, closedAt: true,
      vaicrmAssigned: true, vaicrmChatStatus: true,
    },
  })

  let updated = 0
  for (const lead of leads) {
    if (!lead.vaicrmContactId) continue
    const entry = byContact.get(lead.vaicrmContactId)
    if (!entry) continue
    const { latest, assigned } = entry
    const openedAt = latest.createdAt ? new Date(latest.createdAt) : lead.openedAt
    const closedAt = latest.closedAt ? new Date(latest.closedAt) : null
    const status = latest.status ?? null

    const data: Record<string, unknown> = {}
    if (lead.vaicrmAssigned !== assigned) data.vaicrmAssigned = assigned
    if (lead.vaicrmChatStatus !== status) data.vaicrmChatStatus = status
    if (openedAt && (!lead.openedAt || lead.openedAt.getTime() !== openedAt.getTime())) data.openedAt = openedAt
    const curClosed = lead.closedAt ? lead.closedAt.getTime() : null
    const newClosed = closedAt ? closedAt.getTime() : null
    if (curClosed !== newClosed) data.closedAt = closedAt

    if (Object.keys(data).length) {
      await prisma.lead.update({ where: { id: lead.id }, data })
      updated++
    }
  }
  return updated
}

/**
 * Backfill retroativo: corrige a data de ENTRADA (createdAt) dos leads da Vai
 * de Vendas já importados para o horário real em que entraram no VCRM
 * (contact.createdAt). A sincronização normal só busca contatos novos a partir
 * da marca d'água, então leads antigos não se autocorrigem — esta função busca
 * TODOS os contatos e casa por vaicrmContactId. Retorna quantos leads mudaram.
 */
export async function backfillVaiCreatedAt(opts: { maxPages?: number } = {}): Promise<number> {
  // Busca todos os contatos (desde o começo dos tempos).
  const contacts = await fetchContactsSince(new Date(0), { maxPages: opts.maxPages ?? 50 })
  const byId = new Map<string, VaiCrmContact>()
  for (const c of contacts) if (c.id) byId.set(c.id, c)

  const leads = await prisma.lead.findMany({
    where: { source: 'vaivendas' },
    select: { id: true, vaicrmContactId: true, createdAt: true },
  })

  let updated = 0
  for (const lead of leads) {
    if (!lead.vaicrmContactId) continue
    const c = byId.get(lead.vaicrmContactId)
    if (!c?.createdAt) continue
    const entered = new Date(c.createdAt)
    if (Number.isNaN(entered.getTime())) continue
    if (!lead.createdAt || lead.createdAt.getTime() !== entered.getTime()) {
      await prisma.lead.update({ where: { id: lead.id }, data: { createdAt: entered } })
      updated++
    }
  }
  return updated
}

/**
 * Backfill retroativo do VÍNCULO com o VCRM: percorre TODOS os contatos do
 * VCRM e, para cada contato cujo telefone já existe como lead na ferramenta
 * (por QUALQUER origem) sem `vaicrmContactId`, grava o vínculo. Assim, contatos
 * do VCRM que já estavam na ferramenta por OpaSuite/Leadster passam a ser
 * reconhecidos como "estão no VCRM também", sem duplicar nem trocar a origem.
 * Retorna { linked, notFound }.
 */
export async function backfillVaiContactLinks(
  opts: { maxPages?: number } = {},
): Promise<{ linked: number; notFound: number; scanned: number }> {
  const contacts = await fetchContactsSince(new Date(0), { maxPages: opts.maxPages ?? 50 })
  const allowedDdds = await getAllowedDdds()
  let linked = 0, notFound = 0
  for (const c of contacts) {
    const rawPhone = c.phone ?? c.identifier ?? ''
    const parsed = parsePhone(String(rawPhone), allowedDdds)
    const key = parsed.normalized ?? parsed.raw
    if (!key || key.replace(/\D/g, '').length < 10) continue
    const existing = await prisma.lead.findUnique({
      where: { phoneNormalized: key },
      select: { id: true, vaicrmContactId: true },
    })
    if (!existing) { notFound++; continue }
    if (!existing.vaicrmContactId && c.id) {
      await prisma.lead.update({ where: { id: existing.id }, data: { vaicrmContactId: c.id } })
      linked++
    }
  }
  return { linked, notFound, scanned: contacts.length }
}

/**
 * Detecta contatos internos / de teste / suporte do próprio VCRM que NÃO devem
 * entrar como leads de venda. Casamento por nome (case-insensitive, sem acento).
 */
export function isSupportOrTestContact(c: { name?: string | null }): boolean {
  const n = (c.name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase().trim()
  if (!n) return false
  const patterns = [
    'suporte', 'support', 'teste', 'homolog', 'demonstra',
    'vai tecnologia', 'vaitecnologia', 'vai de vendas', 'vaidevendas', 'vaicrm',
    'vai crm', 'atendimento vai',
  ]
  return patterns.some((p) => n.includes(p))
}

/**
 * IMPORT HISTÓRICO completo do VCRM: percorre TODOS os contatos do VCRM (desde
 * o início) e garante que cada um esteja na ferramenta, pois "lá é só venda".
 *  - telefone inválido / DDD fora da lista permitida: pulado (invalidPhone).
 *  - contato de suporte/teste/interno (por nome): pulado (skippedSupport).
 *  - já existe por outra origem (OpaSuite/Leadster): só vincula vaicrmContactId
 *    (linked) — NÃO duplica nem troca origem/data.
 *  - já existe como vaivendas: deixa como está (skippedExisting).
 *  - não existe: CRIA como lead vaivendas, usando o horário real de entrada no
 *    VCRM (contact.createdAt). (created)
 * Enriquecimento (Kanban/tags) e atendimento são aplicados pela sync normal.
 * Retorna o detalhamento para reportar ao usuário.
 */
export async function importVaiHistorical(
  opts: { maxPages?: number; skipSupport?: boolean } = {},
): Promise<{
  scanned: number; created: number; linked: number; skippedExisting: number
  skippedSupport: number; invalidPhone: number; skippedNames: string[]
}> {
  const skipSupport = opts.skipSupport ?? true
  const [allowedDdds, tagMap] = await Promise.all([getAllowedDdds(), getTagChannelMap()])
  const contacts = await fetchContactsSince(new Date(0), { maxPages: opts.maxPages ?? 50 })

  let created = 0, linked = 0, skippedExisting = 0, skippedSupport = 0, invalidPhone = 0
  const skippedNames: string[] = []

  for (const c of contacts) {
    if (skipSupport && isSupportOrTestContact(c)) {
      skippedSupport++
      if (c.name && skippedNames.length < 50) skippedNames.push(c.name)
      continue
    }
    const rawPhone = c.phone ?? c.identifier ?? ''
    const parsed = parsePhone(String(rawPhone), allowedDdds)
    const key = parsed.normalized ?? parsed.raw
    if (!key || key.replace(/\D/g, '').length < 10) { invalidPhone++; continue }

    const existing = await prisma.lead.findUnique({
      where: { phoneNormalized: key },
      select: { id: true, source: true, vaicrmContactId: true },
    })

    if (existing) {
      if (existing.source !== 'vaivendas') {
        skippedExisting++
        if (!existing.vaicrmContactId && c.id) {
          await prisma.lead.update({ where: { id: existing.id }, data: { vaicrmContactId: c.id } })
          linked++
        }
      } else {
        skippedExisting++
      }
      continue
    }

    const channel = channelForVaiContact(c, tagMap)
    const ad = adInfoFromReferral(c)
    await prisma.lead.create({
      data: {
        phoneRaw: parsed.raw,
        phoneNormalized: key,
        ddi: parsed.ddi,
        ddd: parsed.ddd,
        name: c.name ?? null,
        status: parsed.status as any,
        isNewConversation: true,
        channel,
        adId: ad.adId,
        adTitle: ad.adTitle,
        adUrl: ad.adUrl,
        source: 'vaivendas',
        vaicrmContactId: c.id,
        createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
        openedAt: c.createdAt ? new Date(c.createdAt) : null,
        lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
      },
    })
    created++
  }

  return { scanned: contacts.length, created, linked, skippedExisting, skippedSupport, invalidPhone, skippedNames }
}

/**
 * Enriquecimento retroativo dos leads vinculados ao VCRM a partir do funil
 * Kanban CRM e das tags do contato. Roda sobre TODOS os leads com
 * `vaicrmContactId` (aplica retroativamente, inclusive aos recém-criados nesta
 * mesma sync). Atualiza:
 *  - vaicrmStage (etapa do funil, rótulo curto)
 *  - vaicrmOutcome ('won' | 'lost' | null)
 *  - vaicrmSalesValue (valor do card)
 *  - vaicrmTags (JSON com os nomes das tags do contato)
 * Retorna quantos leads tiveram mudança.
 */
export async function updateVaiCrmEnrichment(opts: { maxPages?: number } = {}): Promise<number> {
  // 1) Cards do Kanban: etapa + desfecho + valor (por contactId).
  const kanban = await fetchKanbanContacts({ maxPages: opts.maxPages ?? 30 })
  const byKanban = new Map<string, { stage: string | null; outcome: string | null; value: number | null }>()
  for (const k of kanban) {
    if (!k?.id) continue
    byKanban.set(k.id, {
      stage: normalizeStageLabel(k.stage ?? null),
      outcome: k.outcome ?? null,
      value: typeof k.salesData?.value === 'number' ? k.salesData.value : null,
    })
  }

  // 2) Tags dos contatos (por contactId). As tags só vêm em /contacts.
  //    Aproveitamos a mesma varredura para captar o ANÚNCIO (adReferral) de cada
  //    contato: canal de mídia (pago_meta) + id/título do anúncio.
  const contacts = await fetchContactsSince(new Date(0), { maxPages: opts.maxPages ?? 50 })
  const byTags = new Map<string, string[]>()
  const byAd = new Map<string, { channel: string | null; adId: string | null; adTitle: string | null; adUrl: string | null }>()
  for (const c of contacts) {
    if (!c?.id) continue
    byTags.set(c.id, contactTagNamesRaw(c))
    const info = adInfoFromReferral(c)
    byAd.set(c.id, { channel: channelFromAdReferral(c), adId: info.adId, adTitle: info.adTitle, adUrl: info.adUrl })
  }

  // Mapa etiqueta->canal para reclassificar a ORIGEM (Meta/Google) dos leads
  // VCRM a partir das tags, mantendo consistência com o OpaSuite.
  const tagMap = await getTagChannelMap()

  const leads = await prisma.lead.findMany({
    where: { vaicrmContactId: { not: null } },
    select: {
      id: true, vaicrmContactId: true, source: true, channel: true,
      adId: true, adTitle: true, adUrl: true,
      vaicrmStage: true, vaicrmOutcome: true, vaicrmSalesValue: true, vaicrmTags: true,
    },
  })

  let updated = 0
  for (const lead of leads) {
    if (!lead.vaicrmContactId) continue
    const k = byKanban.get(lead.vaicrmContactId)
    const tags = byTags.get(lead.vaicrmContactId)
    const data: Record<string, unknown> = {}

    if (k) {
      if (lead.vaicrmStage !== k.stage) data.vaicrmStage = k.stage
      if (lead.vaicrmOutcome !== k.outcome) data.vaicrmOutcome = k.outcome
      const curVal = typeof lead.vaicrmSalesValue === 'number' ? lead.vaicrmSalesValue : null
      if (curVal !== k.value) data.vaicrmSalesValue = k.value
    }
    if (tags !== undefined) {
      const json = tags.length ? JSON.stringify(tags) : null
      if ((lead.vaicrmTags ?? null) !== json) data.vaicrmTags = json
    }

    // Reclassifica a ORIGEM (canal) apenas de leads VCRM puros, por prioridade:
    // ANÚNCIO do VCRM (adReferral -> pago_meta) > tag Meta/Google mapeada >
    // mídia já atribuída (pago_*) preservada > 'http' (site). Também preenche
    // os dados do anúncio (coluna "Anúncio") retroativamente.
    if (lead.source === 'vaivendas') {
      const adInfo = byAd.get(lead.vaicrmContactId)
      const mapped = tags !== undefined ? channelFromTagNames(tags, tagMap) : null
      const cur = typeof lead.channel === 'string' ? lead.channel : null
      const desired = adInfo?.channel ?? mapped ?? (cur && cur.startsWith('pago') ? cur : 'http')
      if (cur !== desired) data.channel = desired
      if (adInfo?.adId && !lead.adId) data.adId = adInfo.adId
      if (adInfo?.adTitle && !lead.adTitle) data.adTitle = adInfo.adTitle
      if (adInfo?.adUrl && !lead.adUrl) data.adUrl = adInfo.adUrl
    }

    if (Object.keys(data).length) {
      await prisma.lead.update({ where: { id: lead.id }, data })
      updated++
    }
  }
  return updated
}

async function getAllowedDdds(): Promise<Set<string> | undefined> {
  const s = await prisma.setting.findUnique({ where: { key: 'allowed_ddds' } })
  if (!s?.value) return undefined
  try {
    const arr = JSON.parse(s.value)
    if (Array.isArray(arr)) return new Set(arr.map(String))
  } catch {}
  return undefined
}

/** Lê o mapa tag(minúscula) -> canal das Settings. Vazio por padrão. */
async function getTagChannelMap(): Promise<Record<string, string>> {
  const s = await prisma.setting.findUnique({ where: { key: TAG_MAP_KEY } })
  if (!s?.value) return {}
  try {
    const obj = JSON.parse(s.value)
    if (obj && typeof obj === 'object') {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') out[k.trim().toLowerCase()] = v
      }
      return out
    }
  } catch {}
  return {}
}

/**
 * Deriva o canal de um contato a partir das suas tags e do mapa configurado.
 *
 * Regra de origem dos leads VCRM (decisão do usuário, out/2026):
 *  - Leads VCRM NÃO são mais 'direto'/'orgânico'. Ou vieram da mídia (nesse
 *    caso o canal pago é preservado via dedupe com OpaSuite/Leadster — tratado
 *    fora desta função) ou vieram via SITE, cuja mídia é 'http'.
 *  - Quando o mapa tag->canal está configurado e uma tag casa, usa-se o canal
 *    mapeado (mídia "como no Opa"); senão o fallback é 'http' (site), não mais
 *    'direto'.
 */
function channelFromTags(c: VaiCrmContact, map: Record<string, string>): string {
  return channelFromTagNames(contactTagNames(c), map) ?? 'http'
}

/**
 * Canal/origem definitivo de um contato do VCRM, por prioridade:
 *  1) ANÚNCIO (adReferral do Click-to-WhatsApp) -> 'pago_meta'. É o sinal mais
 *     forte: o VCRM traz os dados do anúncio Meta que trouxe o contato.
 *  2) Tag mapeada (mapa tag->canal configurado em Configurações).
 *  3) Fallback 'http' (veio pelo site).
 * Decisão do usuário (nov/2026): a origem Meta dos leads VCRM vem do próprio
 * campo de anúncio do VCRM, não de tags manuais.
 */
function channelForVaiContact(c: VaiCrmContact, map: Record<string, string>): string {
  return channelFromAdReferral(c) ?? channelFromTags(c, map)
}

/**
 * Deriva o canal de mídia a partir de uma lista de nomes de tag (já aplicadas
 * no contato) e do mapa configurado. Retorna o canal mapeado (ex.: 'pago_meta',
 * 'pago_google') ou null quando nenhuma tag casa. Compara em minúsculas.
 */
export function channelFromTagNames(names: string[], map: Record<string, string>): string | null {
  if (!names?.length || Object.keys(map).length === 0) return null
  for (const n of names) {
    const key = n.trim().toLowerCase()
    if (map[key]) return map[key]
  }
  return null
}

/**
 * Backfill retroativo da ORIGEM dos leads VCRM puros: todo lead
 * source='vaivendas' que ainda está classificado como 'direto'/'organico' (ou
 * sem canal) passa a 'http' (site). NÃO toca leads de outras origens
 * (OpaSuite/Leadster) nem leads vaivendas que já têm canal de mídia (pago_*).
 * Retorna quantos leads foram atualizados.
 */
export async function backfillVaiChannel(): Promise<number> {
  const res = await prisma.lead.updateMany({
    where: {
      source: 'vaivendas',
      OR: [
        { channel: 'direto' },
        { channel: 'organico' },
        { channel: null },
      ],
    },
    data: { channel: 'http' },
  })
  return res.count
}

export async function syncVaiVendas(opts: { maxPages?: number } = {}): Promise<VaiCrmSyncResult> {
  const now = new Date()
  const lastSyncSetting = await prisma.setting.findUnique({ where: { key: LAST_SYNC_KEY } })
  const firstRun = !lastSyncSetting?.value

  // Primeira execução: só marca o ponto de partida (não importa histórico).
  if (firstRun) {
    await prisma.setting.upsert({
      where: { key: LAST_SYNC_KEY },
      create: { key: LAST_SYNC_KEY, value: now.toISOString() },
      update: { value: now.toISOString() },
    })
    return {
      fetched: 0, created: 0, skippedExisting: 0, invalidPhone: 0, channelUpdated: 0,
      attendanceUpdated: 0, enrichmentUpdated: 0,
      since: now.toISOString(), until: now.toISOString(), firstRun: true,
    }
  }

  // Marca d'água com pequena folga (5 min) para não perder registros na borda.
  const since = new Date(new Date(lastSyncSetting.value).getTime() - 5 * 60 * 1000)
  const [allowedDdds, tagMap] = await Promise.all([getAllowedDdds(), getTagChannelMap()])

  const contacts = await fetchContactsSince(since, { maxPages: opts.maxPages ?? 50 })

  let created = 0, skippedExisting = 0, invalidPhone = 0, channelUpdated = 0

  for (const c of contacts) {
    // Pula contatos internos/suporte/teste do próprio VCRM (não são vendas).
    if (isSupportOrTestContact(c)) continue
    const rawPhone = c.phone ?? c.identifier ?? ''
    const parsed = parsePhone(String(rawPhone), allowedDdds)
    const key = parsed.normalized ?? parsed.raw
    if (!key || key.replace(/\D/g, '').length < 10) { invalidPhone++; continue }

    const channel = channelForVaiContact(c, tagMap)
    const ad = adInfoFromReferral(c)
    const existing = await prisma.lead.findUnique({
      where: { phoneNormalized: key },
      select: { id: true, source: true, name: true, channel: true, createdAt: true, vaicrmContactId: true, adId: true, adTitle: true, adUrl: true },
    })

    if (existing) {
      skippedExisting++
      // DEDUPE entre origens: se o contato JÁ existe na ferramenta por outra
      // origem (OpaSuite/Leadster), não duplicamos nem trocamos a origem/data —
      // mas MARCAMOS o vínculo com o VCRM (vaicrmContactId) para que esse
      // contato seja reconhecido/contado como "está no VCRM também". Sem isto,
      // todo contato do VCRM que já existia por outra origem sumia da contagem.
      if (existing.source !== 'vaivendas' && !existing.vaicrmContactId && c.id) {
        await prisma.lead.update({ where: { id: existing.id }, data: { vaicrmContactId: c.id } })
      }
      // Só mexe em origem/canal/data de leads que SÃO da Vai de Vendas (não toca Opa/Leadster).
      if (existing.source === 'vaivendas') {
        const data: Record<string, unknown> = {}
        if (!existing.name && c.name) data.name = c.name
        // Reclassificação retroativa (anúncio do VCRM > tag > site).
        if (existing.channel !== channel) { data.channel = channel; channelUpdated++ }
        // Preenche os dados do anúncio (coluna "Anúncio") quando o contato veio
        // de anúncio e ainda não temos esses dados.
        if (ad.adId && !existing.adId) data.adId = ad.adId
        if (ad.adTitle && !existing.adTitle) data.adTitle = ad.adTitle
        if (ad.adUrl && !existing.adUrl) data.adUrl = ad.adUrl
        // Corrige a data de entrada para o horário real do VCRM (não o da sync).
        if (c.createdAt) {
          const entered = new Date(c.createdAt)
          if (!Number.isNaN(entered.getTime()) &&
              (!existing.createdAt || existing.createdAt.getTime() !== entered.getTime())) {
            data.createdAt = entered
          }
        }
        if (Object.keys(data).length) {
          await prisma.lead.update({ where: { id: existing.id }, data })
        }
      }
      continue
    }

    await prisma.lead.create({
      data: {
        phoneRaw: parsed.raw,
        phoneNormalized: key,
        ddi: parsed.ddi,
        ddd: parsed.ddd,
        name: c.name ?? null,
        status: parsed.status as any,
        isNewConversation: true,
        channel,
        adId: ad.adId,
        adTitle: ad.adTitle,
        adUrl: ad.adUrl,
        source: 'vaivendas',
        vaicrmContactId: c.id,
        // Entra na ferramenta com o horário REAL em que entrou no VCRM
        // (contact.createdAt), não com o horário da sincronização.
        createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
        openedAt: c.createdAt ? new Date(c.createdAt) : null,
        lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
      },
    })
    created++
  }

  // Atualiza o estado de atendimento (assumido/na fila/encerrado) de TODOS os
  // leads vaivendas a partir dos chats — aplicado retroativamente.
  let attendanceUpdated = 0
  try {
    attendanceUpdated = await updateVaiChatStates()
  } catch (e) {
    console.error('[vaicrm-sync] falha ao atualizar atendimentos:', (e as Error)?.message)
  }

  // Garante que todo lead VCRM puro tenha origem de site ('http'), nunca mais
  // 'direto'/'organico' — aplicado retroativamente a toda a base vaivendas.
  try {
    channelUpdated += await backfillVaiChannel()
  } catch (e) {
    console.error('[vaicrm-sync] falha ao aplicar origem site (http):', (e as Error)?.message)
  }

  // Enriquece etapa do funil Kanban + desfecho + valor + tags (retroativo).
  let enrichmentUpdated = 0
  try {
    enrichmentUpdated = await updateVaiCrmEnrichment()
  } catch (e) {
    console.error('[vaicrm-sync] falha ao enriquecer (Kanban/tags):', (e as Error)?.message)
  }

  await prisma.setting.upsert({
    where: { key: LAST_SYNC_KEY },
    create: { key: LAST_SYNC_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  })

  return {
    fetched: contacts.length,
    created,
    skippedExisting,
    invalidPhone,
    channelUpdated,
    attendanceUpdated,
    enrichmentUpdated,
    since: since.toISOString(),
    until: now.toISOString(),
    firstRun: false,
  }
}
