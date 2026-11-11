export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { originSchema } from '@/lib/admin/schemas'
import { checkOriginPartner } from '@/lib/admin/origin'

export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const ativos = new URL(req.url).searchParams.get('ativos') === '1'
  const origins = await prisma.leadOrigin.findMany({
    where: ativos ? { ativo: true } : undefined,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    include: { parceiro: { select: { id: true, nome: true } } },
  })
  return NextResponse.json({ origins })
}

export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = originSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const d = { ...parsed.data, parceiroId: parsed.data.tipo === 'PARCEIRO' ? parsed.data.parceiroId ?? null : null }
  const err = await checkOriginPartner(d.tipo, d.parceiroId)
  if (err) return jsonError(err)
  try {
    const origin = await prisma.leadOrigin.create({ data: d })
    await audit({ userId: user.id, acao: 'origin.create', entidade: 'LeadOrigin', entidadeId: origin.id, valorNovo: d })
    return NextResponse.json({ origin }, { status: 201 })
  } catch (e) {
    return prismaError(e)
  }
}
