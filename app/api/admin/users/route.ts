export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { USER_SELECT, userSchema } from '@/lib/admin/user'

export async function GET() {
  const user = await requireUser('ADMIN', 'DIRETOR', 'GERENTE')
  if (user instanceof NextResponse) return user
  const users = await prisma.user.findMany({ select: USER_SELECT, orderBy: [{ ativo: 'desc' }, { name: 'asc' }] })
  return NextResponse.json({ users })
}

export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = userSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const { password, ...data } = parsed.data
  try {
    const created = await prisma.user.create({
      data: { ...data, password: await bcrypt.hash(password, 12) },
      select: USER_SELECT,
    })
    await audit({ userId: user.id, acao: 'user.create', entidade: 'User', entidadeId: created.id, valorNovo: data })
    return NextResponse.json({ user: created }, { status: 201 })
  } catch (e) {
    return prismaError(e)
  }
}
