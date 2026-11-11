import { prisma } from '@/lib/prisma'
import {
  sendPurchaseEvent,
  sendLeadIdentifiedEvent,
  sendQualifiedLeadEvent,
} from '@/lib/meta-capi'
import { mapLimit } from '@/lib/opasuite-wait-state'
import { excludedMidiaWhere } from '@/lib/sales-utils'

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

// Concorrência das chamadas HTTP à Meta. Sem toque no banco durante o envio;
// a persistência (incremental) usa updates curtos individuais.
const CONCURRENCY = 10
// Limite de itens processados por invocação/fase. Mantém cada chamada abaixo do
// maxDuration (300s). Como as queries filtram "ainda não enviado", basta repetir
// a ação (botão) para concluir volumes maiores — o progresso é gravado item a item.
const MAX_PER_PHASE = 2500

export interface MetaSendSummary {
  total: number
  sent: number
  errors: number
  skipped: number
  remaining: number
}

function emptySummary(): MetaSendSummary {
  return { total: 0, sent: 0, errors: 0, skipped: 0, remaining: 0 }
}

/**
 * Envia o evento 'Purchase' (com value/currency BRL) à Meta para cada matrícula
 * casada a um lead de ORIGEM META (channel 'pago_meta') ainda não enviada.
 * Exclui mídias bloqueadas (ex.: LPSP). Idempotente: event_id determinístico
 * (purchase-<matricula>) + flag metaPurchaseSent. Persiste item a item.
 */
export async function sendMetaPurchases(opts?: {
  saleIds?: string[]
  sinceDays?: number
}): Promise<MetaSendSummary> {
  const sinceDays = opts?.sinceDays ?? 60
  const where: any = {
    matched: true,
    metaPurchaseSent: false,
    lead: { is: { channel: 'pago_meta' } },
    AND: [excludedMidiaWhere],
  }
  if (opts?.saleIds?.length) where.id = { in: opts.saleIds }
  else where.dataMatricula = { gte: sinceDate(sinceDays) }

  const pending = await prisma.sale.count({ where })
  const sales = await prisma.sale.findMany({
    where,
    include: { lead: { select: { id: true, phoneNormalized: true, name: true } } },
    take: MAX_PER_PHASE,
  })

  const summary = emptySummary()
  summary.total = sales.length

  await mapLimit(sales, CONCURRENCY, async (sale) => {
    const phone = sale.phoneNormalized || sale.lead?.phoneNormalized || null
    const email = sale.email || null
    if (!phone && !email) {
      summary.skipped++
      return null
    }
    const dt = sale.dataMatricula ?? sale.createdAt
    const res = await sendPurchaseEvent(
      sale.matricula,
      { phone, email, name: sale.nome, externalId: sale.lead?.id ?? undefined },
      sale.valorPago ?? 0,
      Math.floor(new Date(dt).getTime() / 1000),
    )
    if (res.success) {
      summary.sent++
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          metaPurchaseSent: true,
          metaPurchaseSentAt: new Date(),
          metaPurchaseEventId: res.eventId,
          metaPurchaseError: null,
        },
      })
    } else {
      summary.errors++
      await prisma.sale.update({
        where: { id: sale.id },
        data: { metaPurchaseError: (res.error ?? 'erro desconhecido').slice(0, 500) },
      })
    }
    return null
  })

  summary.remaining = Math.max(0, pending - summary.sent - summary.skipped)
  return summary
}

export interface BackfillResult {
  lead: MetaSendSummary
  qualified: MetaSendSummary
  purchase: MetaSendSummary
}

/**
 * Backfill retroativo do funil para a Meta, limitado aos últimos `days` dias
 * (a Meta aceita eventos de até ~62 dias). Aplica a mudança a registros já
 * existentes (origem Meta), persistindo item a item (resiliente a timeout):
 *   - 'Lead' para todo lead de origem Meta ainda sem envio (metaLeadEventSent);
 *   - 'QualifiedLead' para leads QUALIFICADO ainda sem envio (metaEventSent);
 *   - 'Purchase' para matrículas casadas (via sendMetaPurchases).
 * Cada fase processa até MAX_PER_PHASE itens; `remaining` indica quanto resta.
 * Repita a ação até remaining = 0 para concluir volumes grandes.
 */
export async function backfillMetaFunnel(days = 60): Promise<BackfillResult> {
  const since = sinceDate(days)

  // ---- LEAD (identificação / medição) ----
  const leadWhere = {
    channel: 'pago_meta',
    createdAt: { gte: since },
    metaLeadEventSent: false,
    phoneNormalized: { not: null },
  } as const
  const leadPending = await prisma.lead.count({ where: leadWhere })
  const leadRows = await prisma.lead.findMany({
    where: leadWhere,
    select: { id: true, phoneNormalized: true, name: true, createdAt: true },
    take: MAX_PER_PHASE,
  })
  const leadSummary = emptySummary()
  leadSummary.total = leadRows.length
  await mapLimit(leadRows, CONCURRENCY, async (l) => {
    const res = await sendLeadIdentifiedEvent(
      l.id,
      { phone: l.phoneNormalized, name: l.name, externalId: l.id },
      Math.floor(new Date(l.createdAt).getTime() / 1000),
    )
    if (res.success) {
      leadSummary.sent++
      await prisma.lead.update({
        where: { id: l.id },
        data: {
          metaLeadEventSent: true,
          metaLeadEventId: res.eventId,
          metaLeadEventSentAt: new Date(),
          metaLeadEventError: null,
        },
      })
    } else {
      leadSummary.errors++
      await prisma.lead.update({
        where: { id: l.id },
        data: { metaLeadEventError: (res.error ?? '').slice(0, 500) },
      })
    }
    return null
  })
  leadSummary.remaining = Math.max(0, leadPending - leadSummary.sent)

  // ---- QUALIFIED LEAD (apenas os ainda não enviados) ----
  const qlWhere = {
    channel: 'pago_meta',
    status: 'QUALIFICADO' as const,
    createdAt: { gte: since },
    metaEventSent: false,
    phoneNormalized: { not: null },
  }
  const qlPending = await prisma.lead.count({ where: qlWhere })
  const qlRows = await prisma.lead.findMany({
    where: qlWhere,
    select: { id: true, phoneNormalized: true, name: true, assumedAt: true, createdAt: true },
    take: MAX_PER_PHASE,
  })
  const qlSummary = emptySummary()
  qlSummary.total = qlRows.length
  await mapLimit(qlRows, CONCURRENCY, async (l) => {
    const dt = l.assumedAt ?? l.createdAt
    const res = await sendQualifiedLeadEvent(
      l.id,
      { phone: l.phoneNormalized, name: l.name, externalId: l.id },
      Math.floor(new Date(dt).getTime() / 1000),
    )
    if (res.success) {
      qlSummary.sent++
      await prisma.lead.update({
        where: { id: l.id },
        data: {
          metaEventSent: true,
          metaEventId: res.eventId,
          metaEventSentAt: new Date(),
          metaEventError: null,
        },
      })
    } else {
      qlSummary.errors++
      await prisma.lead.update({
        where: { id: l.id },
        data: { metaEventError: (res.error ?? '').slice(0, 500) },
      })
    }
    return null
  })
  qlSummary.remaining = Math.max(0, qlPending - qlSummary.sent)

  // ---- PURCHASE ----
  const purchaseSummary = await sendMetaPurchases({ sinceDays: days })

  return { lead: leadSummary, qualified: qlSummary, purchase: purchaseSummary }
}
