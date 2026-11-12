import { LeadStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone-utils'
import { getAllowedDdds, getAllowedDdis, isAutoQualifyEnabled } from '@/lib/settings'

// Status que a regra automática pode recalcular. SEM_INTERESSE/INVALIDO e qualquer status definido à mão
// (statusManual = true) nunca são sobrescritos.
const AUTO_STATUSES: LeadStatus[] = ['NOVO', 'QUALIFICADO', 'DDD_INDESEJADO', 'DDI_INDESEJADO']

/** Status que a regra "pré" atribui a um telefone, considerando a qualificação automática. */
export function autoStatus(parsed: ReturnType<typeof parsePhone>, autoQualify: boolean): LeadStatus {
  if (parsed.status !== 'NOVO') return parsed.status
  return autoQualify ? 'QUALIFICADO' : 'NOVO'
}

export interface ReclassifyResult {
  analisados: number
  alterados: number
  porStatus: Record<string, number>
}

/**
 * Reaplica a regra de DDD/DDI a TODOS os leads existentes com status automático — não só aos futuros.
 * Chamado sempre que allowed_ddds, allowed_ddis ou auto_qualify mudam. Não dispara CAPI retroativo.
 */
export async function reclassifyLeads(): Promise<ReclassifyResult> {
  const [ddds, ddis, autoQualify] = await Promise.all([getAllowedDdds(), getAllowedDdis(), isAutoQualifyEnabled()])
  const leads = await prisma.lead.findMany({
    where: { statusManual: false, status: { in: AUTO_STATUSES } },
    select: { id: true, phoneRaw: true, phoneNormalized: true, status: true },
  })

  const byStatus = new Map<LeadStatus, string[]>()
  for (const l of leads) {
    const next = autoStatus(parsePhone(l.phoneRaw || l.phoneNormalized, ddds, ddis), autoQualify)
    if (next !== l.status) byStatus.set(next, [...(byStatus.get(next) ?? []), l.id])
  }

  await prisma.$transaction(
    Array.from(byStatus.entries()).map(([status, ids]) =>
      prisma.lead.updateMany({ where: { id: { in: ids } }, data: { status } }),
    ),
  )

  const porStatus = Object.fromEntries(Array.from(byStatus.entries()).map(([s, ids]) => [s, ids.length]))
  const alterados = Object.values(porStatus).reduce((a, b) => a + b, 0)
  return { analisados: leads.length, alterados, porStatus }
}
