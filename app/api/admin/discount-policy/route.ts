export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { discountSchema } from '@/lib/admin/schemas'

// Tetos de desconto por papel × segmento (segmento null = todos). Vazio = sem teto (não bloqueia).
export async function GET() {
  const user = await requireUser('ADMIN', 'DIRETOR', 'GERENTE')
  if (user instanceof NextResponse) return user
  const policies = await prisma.discountPolicy.findMany({ orderBy: [{ papel: 'asc' }, { segmento: 'asc' }] })
  return NextResponse.json({ policies })
}

// PUT { items: [{ papel, segmento, tetoPorc | null }] } — null remove o teto. Diretor e Admin.
export async function PUT(req: Request) {
  const user = await requireUser('ADMIN', 'DIRETOR')
  if (user instanceof NextResponse) return user
  const parsed = discountSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  try {
    let alterados = 0
    for (const { papel, segmento, tetoPorc } of parsed.data.items) {
      // NULL não colide no unique do Postgres: busca explícita em vez de upsert.
      const before = await prisma.discountPolicy.findFirst({ where: { papel, segmento } })
      const anterior = before ? Number(before.tetoPorc) : null
      if (anterior === tetoPorc) continue
      if (tetoPorc === null) await prisma.discountPolicy.delete({ where: { id: before!.id } })
      else if (before) await prisma.discountPolicy.update({ where: { id: before.id }, data: { tetoPorc } })
      else await prisma.discountPolicy.create({ data: { papel, segmento, tetoPorc } })
      alterados++
      await audit({
        userId: user.id,
        acao: 'discount.update',
        entidade: 'DiscountPolicy',
        entidadeId: `${papel}:${segmento ?? 'TODOS'}`,
        valorAnterior: { papel, segmento, tetoPorc: anterior },
        valorNovo: { papel, segmento, tetoPorc },
      })
    }
    const policies = await prisma.discountPolicy.findMany({ orderBy: [{ papel: 'asc' }, { segmento: 'asc' }] })
    return NextResponse.json({ policies, alterados })
  } catch (e) {
    return prismaError(e)
  }
}
