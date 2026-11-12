export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { CnpjError, accountScope, cnpjCompleto, trocarCnpj } from '@/lib/accounts'

// Troca do CNPJ (principal uso: substituir o CNPJ provisório da importação pelo real). Auditado.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const { cnpj } = await readJson<{ cnpj?: string }>(req)
  if (!cnpj) return jsonError('Informe o CNPJ')
  const antes = await prisma.account.findFirst({ where: { AND: [{ id: params.id }, accountScope(user)] } })
  if (!antes) return jsonError('Conta não encontrada', 404)
  try {
    const conta = await trocarCnpj(antes.id, cnpj)
    await audit({
      userId: user.id,
      acao: 'account.cnpj',
      entidade: 'Account',
      entidadeId: conta.id,
      valorAnterior: { cnpj: cnpjCompleto(antes), cnpjProvisorio: antes.cnpjProvisorio },
      valorNovo: { cnpj: cnpjCompleto(conta), cnpjProvisorio: false },
    })
    return NextResponse.json({ id: conta.id, cnpj: cnpjCompleto(conta), cnpjProvisorio: false })
  } catch (e) {
    if (e instanceof CnpjError) return jsonError(e.message, e.status)
    return prismaError(e)
  }
}
