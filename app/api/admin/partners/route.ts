export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { partnerSchema } from '@/lib/admin/schemas'

// GET ?ativos=1 → só ativos (para seletores)
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const ativos = new URL(req.url).searchParams.get('ativos') === '1'
  const partners = await prisma.partner.findMany({
    where: ativos ? { ativo: true } : undefined,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ partners })
}

export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = partnerSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  try {
    const partner = await prisma.partner.create({ data: parsed.data })
    await audit({ userId: user.id, acao: 'partner.create', entidade: 'Partner', entidadeId: partner.id, valorNovo: parsed.data })
    return NextResponse.json({ partner }, { status: 201 })
  } catch (e) {
    return prismaError(e)
  }
}
