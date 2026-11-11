import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { fetchAssumeState, refreshLeadWaitStates, mapLimit } from '@/lib/opasuite-wait-state'

/**
 * Relatório de Atendimento dos leads de anúncios.
 * Tempo de atendimento = do início da conversa (openedAt; fallback createdAt)
 * até o atendente assumir na OpaSuite (assumedAt).
 * Horário comercial = segunda a sexta, 8h às 19h (São Paulo, UTC-3), pelo início da conversa.
 */

export type LeadGroup = 'monitor' | 'etssr' | 'vira'
export const GROUP_LABELS: Record<LeadGroup, string> = { monitor: 'Monitor', etssr: 'ETSSR', vira: 'Vira Técnico' }

const BUCKETS = [
  { key: 'lt5m', label: 'Até 5 min', max: 5 * 60 },
  { key: 'lt30m', label: '5–30 min', max: 30 * 60 },
  { key: 'lt2h', label: '30 min–2h', max: 2 * 3600 },
  { key: 'lt8h', label: '2–8h', max: 8 * 3600 },
  { key: 'gt8h', label: 'Mais de 8h', max: Infinity },
] as const

const PENDING_WINDOW_MS = 2 * 3600 * 1000 // conversas com menos de 2h ainda podem estar na fila
const SP_OFFSET_MS = 3 * 3600 * 1000

export interface WindowStats {
  leads: number
  atendidos: number
  naoAtendidos: number
  naFila: number
  /** Assumidos confirmados na OpaSuite mas sem horário de assunção registrado (não entram nos tempos) */
  assumidoSemHorario: number
  mediaSeg: number | null
  medianaSeg: number | null
  buckets: { key: string; label: string; count: number }[]
}

export interface OpenState {
  total: number
  naFila: number
  aguardandoAtendente: number
  aguardandoCliente: number
  semStatus: number
}

export interface GroupRow {
  group: LeadGroup
  label: string
  leads: number
  atendidos: number
  naoAtendidos: number
  semRegistro: number
  comercial: { mediaSeg: number | null; medianaSeg: number | null }
  fora: { mediaSeg: number | null; medianaSeg: number | null }
}

export interface UnattendedLead {
  id: string
  name: string | null
  phone: string
  group: LeadGroup
  groupLabel: string
  startedAt: string
  comercial: boolean
  status: string
  encerrado: boolean
}

export interface AttendanceReport {
  total: number
  comercial: WindowStats
  fora: WindowStats
  porGrupo: GroupRow[]
  naoAtendidos: UnattendedLead[]
  naoAtendidosTotal: number
  /** Assumidos confirmados na OpaSuite sem horário de assunção (webhook não registrou) — retirados dos não atendidos */
  assumidoSemHorarioTotal: number
  /** Situação atual das conversas ainda em aberto (snapshot da última sincronização com a OpaSuite) */
  emAberto: OpenState
  /** Leads sem nenhum registro na OpaSuite (ex.: formulário do site/Leadster) — atendimento não mensurável */
  semRegistro: number
  semRegistroLeadster: number
}

export function isBusinessHours(d: Date): boolean {
  const sp = new Date(d.getTime() - SP_OFFSET_MS)
  const dow = sp.getUTCDay() // 0 = domingo
  const h = sp.getUTCHours()
  return dow >= 1 && dow <= 5 && h >= 8 && h < 19
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

function median(arr: number[]): number | null {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function groupOf(l: { ssrj: boolean; viraTecnico: boolean }): LeadGroup {
  if (l.ssrj) return 'etssr'
  if (l.viraTecnico) return 'vira'
  return 'monitor'
}

interface Parsed {
  id: string
  name: string | null
  phone: string
  status: string
  group: LeadGroup
  start: Date
  comercial: boolean
  waitSec: number | null // null = sem horário de assunção
  pending: boolean
  encerrado: boolean
  semRegistro: boolean
  leadster: boolean
  opaAssumed: boolean
  waitingOn: string | null
  opaStatus: string | null
}

function windowStats(rows: Parsed[]): WindowStats {
  const waits = rows.filter((r) => r.waitSec !== null).map((r) => r.waitSec as number)
  const naFila = rows.filter((r) => r.waitSec === null && r.pending).length
  const assumidoSemHorario = rows.filter((r) => r.waitSec === null && !r.pending && r.opaAssumed).length
  return {
    leads: rows.length,
    atendidos: waits.length,
    naoAtendidos: rows.length - waits.length - naFila - assumidoSemHorario,
    naFila,
    assumidoSemHorario,
    mediaSeg: avg(waits),
    medianaSeg: median(waits),
    buckets: BUCKETS.map((b, i) => {
      const min = i === 0 ? -1 : BUCKETS[i - 1].max
      return { key: b.key, label: b.label, count: waits.filter((w) => w > min && w <= b.max).length }
    }),
  }
}

interface ReportOpts { from?: Date; to?: Date; group?: LeadGroup | ''; includeFiltered?: boolean }

function buildWhere(opts: ReportOpts): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [
    { isNewConversation: true, isAluno: false },
    // Leads de anúncios: Meta/Google (Monitor) + ETSSR + Vira Técnico
    { OR: [{ adId: { not: null } }, { channel: { in: ['pago_meta', 'pago_google'] } }, { ssrj: true }, { viraTecnico: true }] },
  ]
  if (opts.from || opts.to) and.push({ createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } })
  if (!opts.includeFiltered) and.push({ status: { notIn: ['DDD_INDESEJADO', 'DDI_INDESEJADO', 'INVALIDO'] } })
  return { AND: and }
}

export async function getAttendanceReport(opts: ReportOpts): Promise<AttendanceReport> {
  const leads = await prisma.lead.findMany({
    where: buildWhere(opts),
    select: {
      id: true, name: true, phoneRaw: true, phoneNormalized: true, status: true, ssrj: true, viraTecnico: true,
      openedAt: true, assumedAt: true, closedAt: true, isDropped: true, createdAt: true,
      opasuiteConversationId: true, source: true,
      opaAssumed: true, waitingOn: true, opaStatus: true,
    },
  })

  const now = Date.now()
  const parsed: Parsed[] = leads.map((l) => {
    // openedAt muito anterior ao cadastro indica conversa antiga reaproveitada → usa createdAt
    const start = l.openedAt && l.createdAt.getTime() - l.openedAt.getTime() < 24 * 3600 * 1000 ? l.openedAt : l.createdAt
    const waitSec = l.assumedAt ? Math.max(0, (l.assumedAt.getTime() - start.getTime()) / 1000) : null
    const encerrado = Boolean(l.closedAt) || l.isDropped
    return {
      id: l.id,
      name: l.name,
      phone: l.phoneNormalized || l.phoneRaw,
      status: l.status,
      group: groupOf(l),
      start,
      comercial: isBusinessHours(start),
      waitSec,
      pending: waitSec === null && !encerrado && now - start.getTime() < PENDING_WINDOW_MS,
      encerrado,
      // Nunca passou pela OpaSuite (sem abertura, atribuição nem ID de atendimento) → não dá para medir
      semRegistro: !l.openedAt && !l.assumedAt && !l.closedAt && !l.opasuiteConversationId,
      leadster: l.source === 'leadster',
      opaAssumed: l.opaAssumed,
      waitingOn: l.waitingOn,
      opaStatus: l.opaStatus,
    }
  })

  const tracked = parsed.filter((p) => !p.semRegistro)
  const porGrupo: GroupRow[] = (Object.keys(GROUP_LABELS) as LeadGroup[]).map((g) => {
    const rows = tracked.filter((p) => p.group === g)
    const waits = (c: boolean) => rows.filter((r) => r.comercial === c && r.waitSec !== null).map((r) => r.waitSec as number)
    const atendidos = rows.filter((r) => r.waitSec !== null).length
    const pend = rows.filter((r) => r.pending).length
    const assumidoSH = rows.filter((r) => r.waitSec === null && !r.pending && r.opaAssumed).length
    return {
      group: g,
      label: GROUP_LABELS[g],
      leads: rows.length,
      atendidos,
      naoAtendidos: rows.length - atendidos - pend - assumidoSH,
      semRegistro: parsed.filter((p) => p.group === g && p.semRegistro).length,
      comercial: { mediaSeg: avg(waits(true)), medianaSeg: median(waits(true)) },
      fora: { mediaSeg: avg(waits(false)), medianaSeg: median(waits(false)) },
    }
  })

  const scopedAll = opts.group ? parsed.filter((p) => p.group === opts.group) : parsed
  const scoped = scopedAll.filter((p) => !p.semRegistro)
  const noRecord = scopedAll.filter((p) => p.semRegistro)
  // Confirmados assumidos na OpaSuite (sem horário) saem dos não atendidos
  const unattended = scoped
    .filter((p) => p.waitSec === null && !p.pending && !p.opaAssumed)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
  const assumidoSemHorarioTotal = scoped.filter((p) => p.waitSec === null && !p.pending && p.opaAssumed).length

  // Situação atual das conversas ainda em aberto (snapshot da última sincronização)
  const abertas = scoped.filter((p) => !p.encerrado)
  const emAberto: OpenState = {
    total: abertas.length,
    naFila: abertas.filter((p) => p.opaStatus === 'AG').length,
    aguardandoAtendente: abertas.filter((p) => p.opaStatus && p.opaStatus !== 'AG' && p.waitingOn === 'atendente').length,
    aguardandoCliente: abertas.filter((p) => p.opaStatus && p.opaStatus !== 'AG' && p.waitingOn === 'cliente').length,
    semStatus: abertas.filter((p) => !p.opaStatus).length,
  }

  return {
    total: scoped.length,
    comercial: windowStats(scoped.filter((p) => p.comercial)),
    fora: windowStats(scoped.filter((p) => !p.comercial)),
    porGrupo,
    naoAtendidosTotal: unattended.length,
    assumidoSemHorarioTotal,
    emAberto,
    semRegistro: noRecord.length,
    semRegistroLeadster: noRecord.filter((p) => p.leadster).length,
    naoAtendidos: unattended.slice(0, 300).map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      group: p.group,
      groupLabel: GROUP_LABELS[p.group],
      startedAt: p.start.toISOString(),
      comercial: p.comercial,
      status: p.status,
      encerrado: p.encerrado,
    })),
  }
}

export interface VerifyResult {
  conferidos: number // não atendidos consultados na OpaSuite
  assumidosEncontrados: number // confirmados que haviam sido assumidos (webhook perdeu o evento)
  continuamNaoAtendidos: number
  abertosAtualizados: number // conversas em aberto que tiveram a situação atualizada
}

/**
 * Confere na OpaSuite os leads marcados como "não atendidos" e as conversas em aberto.
 * - Melhoria #1: se a Opa mostra que a conversa foi assumida por um atendente (status != AG
 *   e com atendente atribuído), marca opaAssumed=true para tirá-la dos não atendidos.
 * - Melhoria #2: atualiza o estado (aguardando atendente/cliente) das conversas em aberto.
 * Persiste tudo no banco (correção retroativa), então próximas aberturas do relatório já vêm corrigidas.
 */
export async function verifyAttendanceInOpa(opts: ReportOpts): Promise<VerifyResult> {
  const leads = await prisma.lead.findMany({
    where: buildWhere(opts),
    select: {
      id: true, opasuiteConversationId: true, openedAt: true, assumedAt: true, closedAt: true,
      isDropped: true, createdAt: true, opaAssumed: true,
    },
  })
  const now = Date.now()
  const withConv = leads.filter((l) => l.opasuiteConversationId)

  // Pass B (melhoria #2): atualiza situação das conversas em aberto (popula waitingOn/opaStatus)
  const openLeads = withConv.filter((l) => !l.closedAt && !l.isDropped)
  let abertosAtualizados = 0
  for (let i = 0; i < openLeads.length; i += 60) {
    const chunk = openLeads.slice(i, i + 60)
    const r = await refreshLeadWaitStates(chunk.map((l) => l.id))
    abertosAtualizados += r.length
  }

  // Pass A (melhoria #1): confirma na Opa os que estão como não atendidos
  const unattended = withConv.filter((l) => {
    if (l.assumedAt || l.opaAssumed) return false
    const start = l.openedAt && l.createdAt.getTime() - l.openedAt.getTime() < 24 * 3600 * 1000 ? l.openedAt : l.createdAt
    const encerrado = Boolean(l.closedAt) || l.isDropped
    const pending = !encerrado && now - start.getTime() < PENDING_WINDOW_MS
    return !pending
  })

  let assumidosEncontrados = 0
  await mapLimit(unattended, 8, async (l) => {
    const st = await fetchAssumeState(l.opasuiteConversationId as string)
    if (!st) return
    if (st.assumed) assumidosEncontrados++
    await prisma.lead.update({
      where: { id: l.id },
      data: {
        opaStatus: st.opaStatus,
        opaAttendantId: st.attendantId,
        opaAssumed: st.assumed,
        opaStatusCheckedAt: new Date(),
        ...(st.opaStatus === 'F' && st.closedAt && !l.closedAt ? { closedAt: st.closedAt } : {}),
      },
    })
  })

  return {
    conferidos: unattended.length,
    assumidosEncontrados,
    continuamNaoAtendidos: unattended.length - assumidosEncontrados,
    abertosAtualizados,
  }
}
