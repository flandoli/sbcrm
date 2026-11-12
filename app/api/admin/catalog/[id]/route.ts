export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { catalogSchema } from '@/lib/admin/schemas'

// Sem exclusão física: desativar tira o item dos seletores e preserva o histórico.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = catalogSchema.omit({ tipo: true }).partial().safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const before = await prisma.catalogItem.findUnique({ where: { id: params.id } })
  if (!before) return jsonError('Item não encontrado', 404)
  try {
    const item = await prisma.catalogItem.update({ where: { id: params.id }, data: parsed.data })
    await audit({ userId: user.id, acao: 'catalog.update', entidade: 'CatalogItem', entidadeId: params.id, valorAnterior: before, valorNovo: parsed.data })
    return NextResponse.json({ item })
  } catch (e) {
    return prismaError(e)
  }
}
