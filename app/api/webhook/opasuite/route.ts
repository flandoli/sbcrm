export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone-utils'
import { sendLeadIdentifiedEvent, sendQualifiedLeadEvent } from '@/lib/meta-capi'
import { classifyChannel } from '@/lib/channel-utils'
import { detectViraTecnicoOpa, getSsrjChannels } from '@/lib/vira-tecnico-utils'

// IDs das tags de aluno no OpaSuite — se qualquer uma estiver presente,
// o lead é marcado como aluno existente (isAluno = true).
const ALUNO_TAG_IDS = new Set([
  '69eb439dc0ca6245f331006f', // Aluna MG
  '69eb43b0a4eff3b37ca061cc', // Aluno
  '69eb43d30669d3eb941abda3', // Aluno Cri-Cri - Seja Paciente
  '69eb43dc515b219fd44da0b5', // Aluno DRM
  '69eb43e5c0ca6245f3310091', // Aluno em Reserva
  '69eb43eea4eff3b37ca061e0', // Aluno PR
  '69eb43f60669d3eb941abdb6', // Aluno RJ
])

// IDs das tags que indicam que o lead confirmou que NÃO é aluno.
// Quando presente, o lead é marcado com isNotAluno = true (exibido em verde).
const NAO_ALUNO_TAG_IDS = new Set([
  '69eb48d1a4eff3b37ca063ed', // Não é Aluno
])

// IDs das tags que a OpaSuite aplica quando o atendimento vem de um Anúncio
// do WhatsApp (Meta / Click-to-WhatsApp). O campo origem.dados costuma vir
// vazio, então esta tag é o sinal mais confiável de origem paga Meta.
// A Opa está incluindo essa condicional em mais fluxos gradualmente.
const META_AD_TAG_IDS = new Set([
  '6a70fa7b0c3aec72b958e74e', // Meta
])

// IDs das tags que indicam lead "Derrubado": iniciou a conversa mas ficou
// inativo (~3h) e foi encerrado sem continuidade. A Opa aplica essas etiquetas
// automaticamente. Serve para separar esses contatos num painel próprio.
const DROPPED_TAG_IDS = new Set([
  '6a71fb7c13f2037f3c0ca562', // Derrubados
  '69ef599ba4eff3b37ca073f0', // Encerramento Inatividade Bot
])

// Etiquetas SSRJ_* identificam leads vindos de campanhas de OUTRA conta de
// Instagram (família de etiquetas que a Opa cria/expande com o tempo). Em vez
// de fixar IDs, buscamos o catálogo de etiquetas da Opa e detectamos qualquer
// etiqueta cujo nome comece com "SSRJ". O catálogo é cacheado por 30 min.
let ssrjTagIdsCache: { ids: Set<string>; ts: number } | null = null
const SSRJ_CACHE_TTL_MS = 30 * 60 * 1000

async function getSsrjTagIds(): Promise<Set<string>> {
  const now = Date.now()
  if (ssrjTagIdsCache && now - ssrjTagIdsCache.ts < SSRJ_CACHE_TTL_MS) {
    return ssrjTagIdsCache.ids
  }
  const baseUrl = process.env.OPASUITE_API_URL
  const token = process.env.OPASUITE_API_TOKEN
  if (!baseUrl || !token) return ssrjTagIdsCache?.ids ?? new Set<string>()
  try {
    const res = await fetch(`${baseUrl}/etiqueta`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ssrjTagIdsCache?.ids ?? new Set<string>()
    const json = await res.json()
    const list: any[] = Array.isArray(json?.data) ? json.data : []
    const ids = new Set<string>()
    for (const t of list) {
      const nome = String(t?.nome ?? '')
      if (/^ssrj/i.test(nome.trim()) && t?._id) ids.add(String(t._id))
    }
    // Só cacheia resultado não-vazio para não fixar uma falha transitória.
    if (ids.size > 0) ssrjTagIdsCache = { ids, ts: now }
    console.log(`[OPASUITE_SSRJ] ${ids.size} etiquetas SSRJ carregadas do catálogo`)
    return ids.size > 0 ? ids : (ssrjTagIdsCache?.ids ?? new Set<string>())
  } catch (e: any) {
    console.error('[OPASUITE_SSRJ] erro ao carregar catálogo:', e.message)
    return ssrjTagIdsCache?.ids ?? new Set<string>()
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    // LOG COMPLETO DO PAYLOAD para diagnóstico do formato do OpaSuite.
    console.log('[OPASUITE_WEBHOOK] payload recebido:', JSON.stringify(body))

    // Formato oficial do OpaSuite (customerServiceEvent): o telefone vem em
    // event.data.payload.customerChannel no formato "5511964124011@c.us".
    const opa = body?.event?.data?.payload ?? body?.data?.payload ?? null
    let opaPhone: string | null = null
    let opaConversationId: string | null = null
    let opaAction: string | null = null
    if (opa && typeof opa === 'object') {
      const ch = (opa as any).customerChannel ?? (opa as any).customerPhone ?? ''
      if (typeof ch === 'string' && ch) {
        const digits = ch.split('@')[0].replace(/\D/g, '')
        if (digits.length >= 10) opaPhone = digits
      }
      opaConversationId = (opa as any).protocol ?? (opa as any)._id ?? (opa as any).contactId ?? null
    }
    opaAction = body?.event?.data?.action ?? body?.data?.action ?? null

    // Busca profunda por telefone/nome em qualquer nível do objeto, pois o
    // OpaSuite pode aninhar os dados (ex: data.contact.number, sender.phone...).
    const deep = extractFromPayload(body)

    // Extract phone from various field names OpaSuite might send
    const phone =
      opaPhone ??
      body?.phone ?? body?.telefone ?? body?.numero ?? body?.number ??
      body?.contact?.phone ?? body?.contact?.number ?? body?.contact?.telefone ??
      body?.sender?.phone ?? body?.sender?.number ??
      body?.data?.phone ?? body?.data?.number ?? body?.data?.contact?.number ??
      deep.phone ?? ''
    const name =
      body?.name ?? body?.nome ?? body?.contact?.name ?? body?.sender?.name ??
      body?.pushName ?? body?.data?.name ?? deep.name ?? null
    const message = body?.message ?? body?.mensagem ?? body?.first_message ?? body?.text ?? body?.body ?? null
    const conversationId = opaConversationId ?? body?.conversation_id ?? body?.conversationId ?? body?.ticketId ?? body?.id ?? null
    const campaignId = body?.campaign_id ?? body?.campaignId ?? body?.utm_campaign ?? null
    const campaignName = body?.campaign_name ?? body?.campaignName ?? null

    // Validate webhook secret if configured
    const secretHeader = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')
    const configuredSecret = await prisma.setting.findUnique({ where: { key: 'webhook_secret' } })
    if (configuredSecret?.value && secretHeader !== configuredSecret.value && secretHeader !== `Bearer ${configuredSecret.value}`) {
      // Still return 200 to avoid retries, but don't save
      return NextResponse.json({ status: 'unauthorized' }, { status: 200 })
    }

    // Registra TODA chamada recebida (independente de ter telefone) para
    // diagnóstico confiável, já que os logs do servidor têm rotação/atraso.
    const headersObj: Record<string, string> = {}
    req.headers.forEach((v, k) => { headersObj[k] = v })
    let opaApiResponseJson: string | null = null
    async function logWebhook(leadSaved: boolean, note: string) {
      try {
        await prisma.webhookLog.create({
          data: {
            payload: JSON.stringify(body).slice(0, 10000),
            headers: JSON.stringify(headersObj).slice(0, 4000),
            phoneFound: phone ? String(phone) : null,
            leadSaved,
            note,
            apiResponse: opaApiResponseJson?.slice(0, 10000) ?? null,
          },
        })
        // Mantém apenas os 50 registros mais recentes
        const old = await prisma.webhookLog.findMany({
          orderBy: { createdAt: 'desc' }, skip: 50, select: { id: true },
        })
        if (old.length) await prisma.webhookLog.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
      } catch (e) {
        console.error('[OPASUITE_WEBHOOK] falha ao gravar log:', e)
      }
    }

    if (!phone) {
      console.warn('[OPASUITE_WEBHOOK] telefone não encontrado no payload. Chaves de topo:', Object.keys(body ?? {}).join(', '))
      await logWebhook(false, 'Telefone não encontrado no payload')
      return NextResponse.json({ status: 'ok', message: 'no phone' }, { status: 200 })
    }

    // Eventos "new" = nova conversa (contato novo, potencialmente de anúncio).
    // Demais eventos (transferToUser, finish, reasonLinked, etc.) são
    // movimentações de atendimentos existentes: continuam sendo salvos, porém
    // marcados como "Outros contatos" para ficarem em um painel separado.
    const isNewConversation = !opaAction || opaAction === 'new'

    console.log('[OPASUITE_WEBHOOK] telefone extraído:', String(phone), 'evento:', opaAction, 'novaConversa:', isNewConversation)

    // Load allowed DDDs from settings
    const dddsSetting = await prisma.setting.findUnique({ where: { key: 'allowed_ddds' } })
    let allowedDdds: Set<string> | undefined
    if (dddsSetting?.value) {
      try {
        const arr = JSON.parse(dddsSetting.value)
        if (Array.isArray(arr)) allowedDdds = new Set(arr.map(String))
      } catch {}
    }

    const parsed = parsePhone(String(phone), allowedDdds)

    // Qualificação automática (ativada por padrão). Quando ligada, um lead de
    // NOVA conversa que esteja dentro da faixa de DDI+DDD (status NOVO) é
    // qualificado automaticamente e o evento é enviado à Meta.
    const autoSetting = await prisma.setting.findUnique({ where: { key: 'auto_qualify' } })
    const autoQualify = autoSetting?.value !== 'false' // default: true

    const upsertKey = parsed.normalized ?? parsed.raw
    const existing = await prisma.lead.findUnique({ where: { phoneNormalized: upsertKey } })

    // Detecta tags de aluno no payload do webhook (opa.tags = ["id1", "id2"])
    const webhookTags: string[] = Array.isArray((opa as any)?.tags) ? (opa as any).tags : []
    let hasAlunoTag = webhookTags.some((t: string) => ALUNO_TAG_IDS.has(t))
    let hasNaoAlunoTag = webhookTags.some((t: string) => NAO_ALUNO_TAG_IDS.has(t))
    let hasMetaAdTag = webhookTags.some((t: string) => META_AD_TAG_IDS.has(t))
    let hasDroppedTag = webhookTags.some((t: string) => DROPPED_TAG_IDS.has(t))
    // Etiquetas SSRJ (outra conta): resolvidas dinamicamente pelo catálogo.
    const ssrjTagIds = await getSsrjTagIds()
    let hasSsrjTag = webhookTags.some((t: string) => ssrjTagIds.has(t))

    // Vira Técnico: coleta todos os IDs de etiqueta (webhook + API) e o channelId
    // para detectar leads da página "viratecnico" e/ou da linha 11 94577-7262.
    const channelId: string | null = (opa as any)?.channelId ?? null
    const viraTagIds: string[] = [...webhookTags]

    // Busca dados do atendimento populado na API OpaSuite (síncrono)
    // para enriquecer com info de anúncio E detectar tags de aluno.
    const opaId = (opa as any)?._id ?? null
    let adId: string | null = null
    let adTitle: string | null = null
    let adUrl: string | null = null
    let adMediaUrl: string | null = null
    let opaOpenedAt: Date | null = null
    let opaAssumedAt: Date | null = null
    let opaClosedAt: Date | null = null

    // Timestamp do evento enviado pelo OpaSuite (mais confiável que o horário
    // de recebimento do servidor, conforme recomendação da documentação).
    const eventTimestamp = body?.event?.timestamp
      ? new Date(body.event.timestamp)
      : null

    // Detecta eventos de "atendimento assumido" — quando o atendente pega o caso.
    // Ações primárias: transferToUser, transferToAttendant, assumido, assumed.
    // Secundário: transferToDepartment COM attendantId preenchido.
    // NÃO inclui reasonLinked/finish/new — esses têm status EA mas não são assunção.
    const hasAttendant = !!(opa as any)?.attendantId
    const ASSUMED_ACTIONS = new Set(['transferToUser', 'transferToAttendant', 'assumido', 'assumed'])
    const isAssumedEvent =
      ASSUMED_ACTIONS.has(opaAction ?? '') ||
      (opaAction === 'transferToDepartment' && hasAttendant)

    console.log('[OPASUITE_WEBHOOK] assunção check:', { opaAction, hasAttendant, status: (opa as any)?.status, isAssumedEvent })

    // Status atual da conversa na Opa (AG/EA/F). Zera opaStatusCheckedAt para
    // que a tabela reconsulte quem está aguardando (cliente x atendente).
    const payloadStatus = typeof (opa as any)?.status === 'string' ? String((opa as any).status) : null
    const opaStatusData = payloadStatus
      ? {
          opaStatus: payloadStatus,
          opaStatusCheckedAt: null,
          ...(payloadStatus === 'AG' ? { waitingOn: 'atendente' } : payloadStatus === 'F' ? { waitingOn: null } : {}),
        }
      : {}

    if (isAssumedEvent && eventTimestamp) {
      opaAssumedAt = eventTimestamp
      console.log('[OPASUITE_WEBHOOK] evento de assunção detectado, timestamp:', opaAssumedAt.toISOString())
    }

    if (opaId) {
      try {
        const apiData = await fetchOpasuiteDetails(opaId)
        if (apiData) {
          opaApiResponseJson = JSON.stringify(apiData)
          // Checa tags de aluno na resposta populada da API
          const apiTags: any[] = Array.isArray(apiData?.data?.tags) ? apiData.data.tags : []
          if (!hasAlunoTag) {
            hasAlunoTag = apiTags.some((t: any) => ALUNO_TAG_IDS.has(t?.id_tag ?? t))
          }
          if (!hasNaoAlunoTag) {
            hasNaoAlunoTag = apiTags.some((t: any) => NAO_ALUNO_TAG_IDS.has(t?.id_tag ?? t))
          }
          if (!hasMetaAdTag) {
            hasMetaAdTag = apiTags.some((t: any) => META_AD_TAG_IDS.has(t?.id_tag ?? t))
          }
          if (!hasDroppedTag) {
            hasDroppedTag = apiTags.some((t: any) => DROPPED_TAG_IDS.has(t?.id_tag ?? t))
          }
          if (!hasSsrjTag) {
            hasSsrjTag = apiTags.some((t: any) => ssrjTagIds.has(t?.id_tag ?? t))
          }
          for (const t of apiTags) viraTagIds.push(String(t?.id_tag ?? t))
          // Captura timestamps de abertura e encerramento do atendimento
          if (apiData?.data?.date) {
            try { opaOpenedAt = new Date(apiData.data.date) } catch {}
          }
          if (apiData?.data?.fim) {
            try { opaClosedAt = new Date(apiData.data.fim) } catch {}
          }
          // Se o status na API já é EA (Em Atendimento) e não temos assumedAt,
          // usa o timestamp do evento como proxy.
          if (!opaAssumedAt && apiData?.data?.status === 'EA' && eventTimestamp) {
            // Não usamos o eventTimestamp aqui pois pode ser de um evento new/finish.
            // Só marcamos se o evento corrente é de assunção.
          }
          const origem = apiData?.data?.origem
          if (origem && origem.tipo && origem.dados) {
            adId = origem.dados.id ?? null
            adTitle = origem.dados.titulo ?? null
            adUrl = origem.dados.url ?? null
            adMediaUrl = origem.dados.mediaUrl ?? null
            console.log(`[OPASUITE_API] anúncio detectado: id=${adId}, titulo=${adTitle}`)
          }
        }
      } catch (e: any) {
        console.error('[OPASUITE_API] erro ao buscar detalhes:', e.message)
      }
    }

    // Detecta Vira Técnico (slug no texto, channelId configurado ou etiqueta configurada).
    const hasViraTecnico = await detectViraTecnicoOpa({
      channelId,
      tagIds: viraTagIds,
      textFields: [adUrl, adTitle, campaignName, campaignId, message],
    })

    // SSRJ também pode ser determinado pela LINHA de origem (channelId da linha
    // 21 2042-2360), além das etiquetas SSRJ_* do catálogo. Combina os dois.
    const hasSsrjChannel = channelId ? (await getSsrjChannels()).has(String(channelId)) : false
    const hasSsrj = hasSsrjTag || hasSsrjChannel

    if (existing) {
      // Lead já existe: apenas atualiza dados/classificação, sem reenviar à Meta.
      const isAlunoExisting = hasAlunoTag || existing.isAluno
      await prisma.lead.update({
        where: { phoneNormalized: upsertKey },
        data: {
          name: name ?? undefined,
          messageFirst: message ?? undefined,
          opasuiteConversationId: conversationId ? String(conversationId) : undefined,
          campaignId: campaignId ? String(campaignId) : undefined,
          campaignName: campaignName ?? undefined,
          opasuiteEvent: opaAction ?? undefined,
          // Só promove para "nova conversa"; nunca rebaixa.
          ...(isNewConversation ? { isNewConversation: true } : {}),
          // Sticky: uma vez aluno, sempre aluno. Ao identificar (na abertura ou
          // depois), o lead recebe o status ALUNO e vai para "Outros contatos".
          ...(isAlunoExisting ? { isAluno: true, status: 'ALUNO' } : {}),
          // Confirmou que não é aluno: marca para exibição em verde.
          ...(hasNaoAlunoTag ? { isNotAluno: true } : {}),
          // Atualiza dados de anúncio se encontrados e lead ainda não tem.
          ...(!existing.adId && adId ? { adId, adTitle, adUrl, adMediaUrl } : {}),
          // Canal: define quando ainda não há; e SEMPRE promove para pago_meta
          // quando a tag Meta aparecer (a tag costuma chegar em evento posterior
          // ao "new", então o canal inicial pode ter sido direto/orgânico).
          ...(!existing.channel
            ? { channel: classifyChannel(null, null, false, !!adId || hasMetaAdTag) }
            : ((hasMetaAdTag || !!adId || !!existing.adId) && !String(existing.channel).startsWith('pago')
                ? { channel: 'pago_meta' } : {})),
          // Etiqueta Meta da Opa: sticky (uma vez etiquetado, permanece) e
          // sempre registra o momento da verificação.
          ...(hasMetaAdTag ? { metaTagged: true } : {}),
          // SSRJ (etiqueta SSRJ_* OU linha 21 2042-2360 pelo channelId): sticky.
          ...(hasSsrj ? { ssrj: true } : {}),
          // Vira Técnico: sticky (uma vez marcado, permanece).
          ...(hasViraTecnico ? { viraTecnico: true } : {}),
          ...(channelId && !existing.opaChannelId ? { opaChannelId: String(channelId) } : {}),
          metaTagCheckedAt: new Date(),
          // Atualiza timestamps do atendimento
          ...(opaOpenedAt && !existing.openedAt ? { openedAt: opaOpenedAt } : {}),
          // Derrubado: marca quando a tag de inatividade/derrubado aparece.
          // Se o atendente assumiu o caso, deixa de ser "derrubado" (limpa).
          ...(isAssumedEvent
            ? { isDropped: false }
            : (hasDroppedTag ? { isDropped: true } : {})),
          // Só grava assumedAt se (a) ainda não tem, e (b) é anterior ao closedAt conhecido
          ...(opaAssumedAt && !existing.assumedAt &&
              !(existing.closedAt && opaAssumedAt.getTime() > new Date(existing.closedAt).getTime())
            ? { assumedAt: opaAssumedAt } : {}),
          ...(opaClosedAt ? { closedAt: opaClosedAt } : {}),
          ...opaStatusData,
        },
      })
      // Envio à Meta ADIADO: dispara na ASSUNÇÃO do atendente (transferToUser
      // etc.), momento em que a triagem — inclusive a identificação de aluno —
      // já ocorreu. Só envia se elegível, NÃO for aluno e ainda não tiver sido
      // enviado. Assim alunos identificados durante a triagem nunca vão à Meta.
      const metaAlreadySent = existing.metaEventSent
      // Evento 'Lead' (topo do funil / medição): disparado na identificação de
      // um lead de origem Meta, assim que detectamos a origem — independente da
      // qualificação posterior. Guard metaLeadEventSent garante idempotência.
      if (existing.channel === 'pago_meta' && !existing.metaLeadEventSent) {
        const leadEvt = await sendLeadIdentifiedEvent(existing.id, { phone: upsertKey, name, externalId: existing.id })
        await prisma.lead.update({
          where: { id: existing.id },
          data: {
            metaLeadEventSent: leadEvt.success,
            metaLeadEventId: leadEvt.eventId,
            metaLeadEventError: leadEvt.error ?? null,
            metaLeadEventSentAt: leadEvt.success ? new Date() : null,
          },
        })
      }
      if (
        autoQualify &&
        isAssumedEvent &&
        !isAlunoExisting &&
        !metaAlreadySent &&
        existing.isNewConversation &&
        existing.status === 'NOVO'
      ) {
        const metaResult = await sendQualifiedLeadEvent(existing.id, { phone: upsertKey, name, externalId: existing.id })
        await prisma.lead.update({
          where: { phoneNormalized: upsertKey },
          data: {
            status: 'QUALIFICADO',
            metaEventSent: metaResult.success,
            metaEventId: metaResult.eventId,
            metaEventError: metaResult.error ?? null,
            metaEventSentAt: metaResult.success ? new Date() : null,
          },
        })
        await logWebhook(true, `Lead qualificado na assunção e ${metaResult.success ? 'enviado à Meta' : 'FALHA ao enviar à Meta'}${adTitle ? ` (anúncio: ${adTitle})` : ''}${opaAction ? ` (evento ${opaAction})` : ''}`)
        return NextResponse.json({ status: 'ok', autoQualified: true, metaSent: metaResult.success }, { status: 200 })
      }

      await logWebhook(true, `Lead atualizado (status ${existing.status}${isAlunoExisting ? ', aluno' : ''}${opaAction ? `, evento ${opaAction}` : ''})`)
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    // Lead novo
    const isAlunoNew = hasAlunoTag
    const created = await prisma.lead.create({
      data: {
        phoneRaw: parsed.raw,
        phoneNormalized: upsertKey,
        ddi: parsed.ddi,
        ddd: parsed.ddd,
        name,
        campaignId: campaignId ? String(campaignId) : null,
        campaignName: campaignName ?? null,
        messageFirst: message,
        // Aluno identificado já na abertura recebe status ALUNO (vai p/ Outros).
        status: (isAlunoNew ? 'ALUNO' : parsed.status) as any,
        opasuiteConversationId: conversationId ? String(conversationId) : null,
        isNewConversation,
        opasuiteEvent: opaAction ?? null,
        adId,
        adTitle,
        adUrl,
        adMediaUrl,
        isAluno: isAlunoNew,
        isNotAluno: hasNaoAlunoTag,
        // Registra se a Opa reportou a origem Meta via etiqueta. Serve para
        // detectar leads com evidência de anúncio (referral) que a Opa NÃO
        // etiquetou como Meta — a principal causa da diferença Meta × Opa.
        metaTagged: hasMetaAdTag,
        metaTagCheckedAt: new Date(),
        ssrj: hasSsrj,
        viraTecnico: hasViraTecnico,
        opaChannelId: channelId ? String(channelId) : null,
        isDropped: hasDroppedTag && !isAssumedEvent,
        channel: classifyChannel(null, null, false, !!adId || hasMetaAdTag),
        source: 'opasuite',
        openedAt: opaOpenedAt,
        assumedAt: opaAssumedAt,
        closedAt: opaClosedAt,
        ...opaStatusData,
      },
    })

    // NÃO envia à Meta na abertura ("new"). O envio é ADIADO para a assunção
    // do atendente (ver branch de lead existente), quando a triagem já ocorreu
    // e alunos já foram identificados. Isso evita mandar aluno para a Meta.
    // Caso raro: se o PRIMEIRO evento já for uma assunção de nova conversa e o
    // lead for elegível e não-aluno, envia aqui mesmo.
    // Evento 'Lead' (topo do funil) na criação de lead de origem Meta.
    if (created.channel === 'pago_meta' && !created.metaLeadEventSent) {
      const leadEvt = await sendLeadIdentifiedEvent(created.id, { phone: upsertKey, name, externalId: created.id })
      await prisma.lead.update({
        where: { id: created.id },
        data: {
          metaLeadEventSent: leadEvt.success,
          metaLeadEventId: leadEvt.eventId,
          metaLeadEventError: leadEvt.error ?? null,
          metaLeadEventSentAt: leadEvt.success ? new Date() : null,
        },
      })
    }
    if (autoQualify && isAssumedEvent && isNewConversation && parsed.status === 'NOVO' && !isAlunoNew) {
      const metaResult = await sendQualifiedLeadEvent(created.id, { phone: upsertKey, name, externalId: created.id })
      await prisma.lead.update({
        where: { id: created.id },
        data: {
          status: 'QUALIFICADO',
          metaEventSent: metaResult.success,
          metaEventId: metaResult.eventId,
          metaEventError: metaResult.error ?? null,
          metaEventSentAt: metaResult.success ? new Date() : null,
        },
      })
      await logWebhook(true, `Lead qualificado na assunção e ${metaResult.success ? 'enviado à Meta' : 'FALHA ao enviar à Meta'}${adTitle ? ` (anúncio: ${adTitle})` : ''}${opaAction ? ` (evento ${opaAction})` : ''}`)
      return NextResponse.json({ status: 'ok', autoQualified: true, metaSent: metaResult.success, adId }, { status: 200 })
    }

    await logWebhook(true, `Lead salvo (status ${parsed.status}${isAlunoNew ? ', aluno' : ''}${hasMetaAdTag ? ', tag Meta' : ''}${hasDroppedTag ? ', derrubado' : ''}${adTitle ? `, anúncio: ${adTitle}` : ''}${opaAction ? `, evento ${opaAction}` : ''})`)
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err: any) {
    console.error('Webhook error:', err)
    // Always return 200 to prevent retries
    return NextResponse.json({ status: 'ok', error: 'internal' }, { status: 200 })
  }
}

// Busca dados completos do atendimento populado na API OpaSuite.
// Retorna o JSON completo ou null em caso de erro.
async function fetchOpasuiteDetails(atendimentoId: string): Promise<any | null> {
  const baseUrl = process.env.OPASUITE_API_URL
  const token = process.env.OPASUITE_API_TOKEN
  if (!baseUrl || !token) {
    console.warn('[OPASUITE_API] OPASUITE_API_URL ou OPASUITE_API_TOKEN não configurados')
    return null
  }
  try {
    const url = `${baseUrl}/atendimento/${atendimentoId}?populated=true`
    console.log('[OPASUITE_API] buscando:', url)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`[OPASUITE_API] status ${res.status}:`, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    console.log('[OPASUITE_API] resposta recebida, chaves:', Object.keys(data))
    return data
  } catch (e: any) {
    console.error('[OPASUITE_API] erro:', e.message)
    return null
  }
}

// Percorre recursivamente o objeto procurando o primeiro valor que pareça um
// telefone (>= 10 dígitos) e um possível nome, cobrindo formatos aninhados
// desconhecidos do OpaSuite.
function extractFromPayload(obj: any, depth = 0): { phone: string | null; name: string | null } {
  let phone: string | null = null
  let name: string | null = null
  if (!obj || typeof obj !== 'object' || depth > 5) return { phone, name }

  const phoneKeys = ['phone', 'telefone', 'numero', 'number', 'whatsapp', 'msisdn', 'from', 'wa_id']
  const nameKeys = ['name', 'nome', 'pushname', 'contactname', 'sendername']

  for (const [key, value] of Object.entries(obj)) {
    const kl = key.toLowerCase()
    if (!phone && typeof value === 'string') {
      const digits = value.replace(/\D/g, '')
      if (phoneKeys.some((k) => kl.includes(k)) && digits.length >= 10) phone = value
    }
    if (!name && typeof value === 'string' && value.trim()) {
      if (nameKeys.some((k) => kl.includes(k))) name = value
    }
    if (value && typeof value === 'object') {
      const nested = extractFromPayload(value, depth + 1)
      phone = phone ?? nested.phone
      name = name ?? nested.name
    }
  }
  return { phone, name }
}

export async function GET() {
  return NextResponse.json({ status: 'active', message: 'Webhook OpaSuite ativo' })
}
