export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/api'
import { accountScope, cnpjCompleto, filtroContas } from '@/lib/accounts'

// Lista de contas visíveis ao usuário. ?q= busca por nome/CNPJ; ?provisorio=1 só CNPJ provisório; ?responsavel=<id>.
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const params = new URL(req.url).searchParams
  const [contas, totalProvisorio] = await Promise.all([
    prisma.account.findMany({
      where: filtroContas(user, params),
      orderBy: [{ cnpjProvisorio: 'desc' }, { razaoSocial: 'asc' }],
      take: 500,
      select: {
        id: true, razaoSocial: true, nomeFantasia: true, cnpjRaiz: true, cnpjEstabelecimento: true, cnpjDv: true,
        cnpjProvisorio: true, segmento: true, statusConta: true,
        responsavel: { select: { name: true, email: true } },
        origem: { select: { nome: true } },
        _count: { select: { oportunidades: true, pessoas: true, notas: true } },
      },
    }),
    prisma.account.count({ where: { AND: [accountScope(user), { cnpjProvisorio: true }] } }),
  ])
  return NextResponse.json({
    totalProvisorio,
    contas: contas.map(({ cnpjRaiz, cnpjEstabelecimento, cnpjDv, ...c }) => ({ ...c, cnpj: cnpjCompleto({ cnpjRaiz, cnpjEstabelecimento, cnpjDv }) })),
  })
}
