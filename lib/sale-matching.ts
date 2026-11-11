// Casamento venda↔lead/conta (lógica mantida do clone, adaptada ao modelo Sale do FC).
// Ordem: (1) CNPJ completo → Account (CASADO); (2) telefone normalizado → Lead (CASADO);
// (3) razão social normalizada → proposta para confirmação (REVISAO); (4) NAO_CASADO.
// A receita é sempre atribuída por Sale.datavenda (nunca pela data de importação).
import type { StatusCasamento } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone-utils'

export function onlyDigits(v?: string | null): string {
  return (v ?? '').replace(/\D/g, '')
}

/** Divide CNPJ (14 dígitos) em raiz/estabelecimento/DV. */
export function splitCnpj(cnpj?: string | null): { raiz: string; estabelecimento: string; dv: string } | null {
  const d = onlyDigits(cnpj)
  if (d.length !== 14) return null
  return { raiz: d.slice(0, 8), estabelecimento: d.slice(8, 12), dv: d.slice(12) }
}

export function normalizeRazaoSocial(v?: string | null): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(LTDA|S\/?A|ME|EPP|EIRELI)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

export interface SaleMatchInput {
  cnpj?: string | null
  razaoSocial?: string | null
  phone?: string | null
}

export interface SaleMatchResult {
  status: StatusCasamento
  accountId: string | null
  leadId: string | null
  phoneNormalized: string | null
  motivo: string
}

export async function matchSale(input: SaleMatchInput): Promise<SaleMatchResult> {
  const phoneNormalized = input.phone ? parsePhone(input.phone).normalized : null
  const base = { accountId: null, leadId: null, phoneNormalized }

  const cnpj = splitCnpj(input.cnpj)
  if (cnpj) {
    const account = await prisma.account.findUnique({
      where: { cnpjRaiz_cnpjEstabelecimento: { cnpjRaiz: cnpj.raiz, cnpjEstabelecimento: cnpj.estabelecimento } },
      select: { id: true },
    })
    if (account) return { ...base, status: 'CASADO', accountId: account.id, motivo: 'cnpj' }
  }

  if (phoneNormalized) {
    const lead = await prisma.lead.findUnique({ where: { phoneNormalized }, select: { id: true, accountId: true } })
    if (lead) return { ...base, status: 'CASADO', leadId: lead.id, accountId: lead.accountId, motivo: 'telefone' }
  }

  const razao = normalizeRazaoSocial(input.razaoSocial)
  if (razao) {
    const candidatos = await prisma.account.findMany({
      where: { razaoSocial: { contains: (input.razaoSocial ?? '').trim().split(/\s+/)[0], mode: 'insensitive' } },
      select: { id: true, razaoSocial: true },
      take: 50,
    })
    const hit = candidatos.find((a) => normalizeRazaoSocial(a.razaoSocial) === razao)
    if (hit) return { ...base, status: 'REVISAO', accountId: hit.id, motivo: 'razao_social' }
  }

  return { ...base, status: 'NAO_CASADO', motivo: 'sem_correspondencia' }
}
