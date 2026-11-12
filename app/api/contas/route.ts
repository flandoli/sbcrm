export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/api'
import { accountScope, cnpjCompleto } from '@/lib/accounts'
import { onlyDigits } from '@/lib/import/normalize'

// Lista de contas visíveis ao usuário. ?q= busca por nome/CNPJ; ?provisorio=1 só as com CNPJ provisório.
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const scope = accountScope(user)
  const and: Prisma.AccountWhereInput[] = [scope]
  if (url.searchParams.get('provisorio') === '1') and.push({ cnpjProvisorio: true })
  if (q) {
    const dig = onlyDigits(q)
    and.push({
      OR: [
        { razaoSocial: { contains: q, mode: 'insensitive' } },
        { nomeFantasia: { contains: q, mode: 'insensitive' } },
        ...(dig.length >= 4 ? [{ cnpjRaiz: { startsWith: dig.slice(0, 8) } }] : []),
      ],
    })
  }
  const [contas, totalProvisorio] = await Promise.all([
    prisma.account.findMany({
      where: { AND: and },
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
    prisma.account.count({ where: { AND: [scope, { cnpjProvisorio: true }] } }),
  ])
  return NextResponse.json({
    totalProvisorio,
    contas: contas.map(({ cnpjRaiz, cnpjEstabelecimento, cnpjDv, ...c }) => ({ ...c, cnpj: cnpjCompleto({ cnpjRaiz, cnpjEstabelecimento, cnpjDv }) })),
  })
}
