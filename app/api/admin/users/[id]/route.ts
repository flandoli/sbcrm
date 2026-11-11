export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { USER_SELECT, userPatchSchema } from '@/lib/admin/user'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = userPatchSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)

  const before = await prisma.user.findUnique({ where: { id: params.id }, select: USER_SELECT })
  if (!before) return jsonError('Usuário não encontrado', 404)

  // Proteções: ninguém se desativa ou se rebaixa; sempre resta ao menos um Admin ativo.
  const { ativo: ativoReq } = parsed.data
  const losingAdmin = before.papel === 'ADMIN' && ((parsed.data.papel && parsed.data.papel !== 'ADMIN') || ativoReq === false)
  if (params.id === user.id && (ativoReq === false || losingAdmin)) return jsonError('Você não pode desativar nem rebaixar o próprio usuário')
  if (losingAdmin && (await prisma.user.count({ where: { papel: 'ADMIN', ativo: true } })) <= 1) {
    return jsonError('É preciso manter ao menos um Admin ativo')
  }

  const { password, ativo, ...data } = parsed.data
  try {
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { ...data, ...(ativo !== undefined ? { ativo } : {}), ...(password ? { password: await bcrypt.hash(password, 12) } : {}) },
      select: USER_SELECT,
    })
    await audit({
      userId: user.id,
      acao: password ? 'user.update+password' : 'user.update',
      entidade: 'User',
      entidadeId: params.id,
      valorAnterior: before,
      valorNovo: { ...data, ...(ativo !== undefined ? { ativo } : {}) },
    })
    return NextResponse.json({ user: updated })
  } catch (e) {
    return prismaError(e)
  }
}
