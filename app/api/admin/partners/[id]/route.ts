export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { partnerSchema } from '@/lib/admin/schemas'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = partnerSchema.partial().safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const before = await prisma.partner.findUnique({ where: { id: params.id } })
  if (!before) return jsonError('Parceiro não encontrado', 404)
  try {
    const partner = await prisma.partner.update({ where: { id: params.id }, data: parsed.data })
    await audit({ userId: user.id, acao: 'partner.update', entidade: 'Partner', entidadeId: params.id, valorAnterior: before, valorNovo: parsed.data })
    return NextResponse.json({ partner })
  } catch (e) {
    return prismaError(e)
  }
}
