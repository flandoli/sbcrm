import type { Account, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/lib/session'
import { formatCnpj, isCnpjFantasma, isCnpjValido, onlyDigits, splitCnpj } from '@/lib/import/normalize'

/** Contas visíveis: Admin/Diretor veem todas; Gerente, as do seu segmento; Vendedor, as suas. */
export function accountScope(user: SessionUser): Prisma.AccountWhereInput {
  if (user.papel === 'ADMIN' || user.papel === 'DIRETOR') return {}
  if (user.papel === 'GERENTE') return user.segmento ? { segmento: user.segmento } : {}
  return { responsavelId: user.id }
}

export const cnpjCompleto = (a: Pick<Account, 'cnpjRaiz' | 'cnpjEstabelecimento' | 'cnpjDv'>) =>
  formatCnpj(`${a.cnpjRaiz}${a.cnpjEstabelecimento}${a.cnpjDv}`)

/**
 * Bloqueio do CNPJ provisório: a conta pode ser trabalhada no funil, mas não pode ganhar
 * (Fechamento), receber proposta aceita nem gerar faturamento até ter o CNPJ real.
 * Retorna a mensagem de bloqueio ou null.
 */
export function exigeCnpjReal(a: Pick<Account, 'cnpjProvisorio'>, acao = 'continuar'): string | null {
  return a.cnpjProvisorio ? `Informe o CNPJ real da conta para ${acao} (o CNPJ atual é provisório).` : null
}

export class CnpjError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** Troca o CNPJ (provisório → real, ou correção). Valida dígitos verificadores, unicidade e faixa fantasma. */
export async function trocarCnpj(accountId: string, novo: string) {
  const d = onlyDigits(novo)
  if (isCnpjFantasma(d)) throw new CnpjError('Esse é um CNPJ provisório. Informe o CNPJ real da empresa.')
  if (!isCnpjValido(d)) throw new CnpjError('CNPJ inválido: confira os 14 dígitos.')
  const s = splitCnpj(d)
  const dono = await prisma.account.findUnique({
    where: { cnpjRaiz_cnpjEstabelecimento: { cnpjRaiz: s.cnpjRaiz, cnpjEstabelecimento: s.cnpjEstabelecimento } },
    select: { id: true, razaoSocial: true },
  })
  if (dono && dono.id !== accountId) throw new CnpjError(`Esse CNPJ já está cadastrado na conta "${dono.razaoSocial}".`, 409)
  return prisma.account.update({ where: { id: accountId }, data: { ...s, cnpjProvisorio: false } })
}
