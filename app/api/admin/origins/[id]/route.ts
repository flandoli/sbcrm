export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { originSchema } from '@/lib/admin/schemas'
import { checkOriginPartner } from '@/lib/admin/origin'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = originSchema.partial().safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const before = await prisma.leadOrigin.findUnique({ where: { id: params.id } })
  if (!before) return jsonError('Origem não encontrada', 404)

  const tipo = parsed.data.tipo ?? before.tipo
  const parceiroId = tipo === 'PARCEIRO' ? (parsed.data.parceiroId !== undefined ? parsed.data.parceiroId : before.parceiroId) : null
  // Só revalida o parceiro quando tipo/parceiro mudam (permite desativar origem cujo parceiro já foi desativado).
  if (parsed.data.tipo !== undefined || parsed.data.parceiroId !== undefined) {
    const err = await checkOriginPartner(tipo, parceiroId)
    if (err) return jsonError(err)
  }
  const data = { ...parsed.data, parceiroId }
  try {
    const origin = await prisma.leadOrigin.update({ where: { id: params.id }, data })
    await audit({ userId: user.id, acao: 'origin.update', entidade: 'LeadOrigin', entidadeId: params.id, valorAnterior: before, valorNovo: data })
    return NextResponse.json({ origin })
  } catch (e) {
    return prismaError(e)
  }
}
