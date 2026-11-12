export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { productSchema } from '@/lib/admin/schemas'

// Sem exclusão física: produto desativado sai dos seletores e continua nas propostas antigas.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = productSchema.partial().safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const before = await prisma.product.findUnique({ where: { id: params.id } })
  if (!before) return jsonError('Produto não encontrado', 404)
  try {
    const produto = await prisma.product.update({ where: { id: params.id }, data: parsed.data })
    await audit({ userId: user.id, acao: 'product.update', entidade: 'Product', entidadeId: params.id, valorAnterior: before, valorNovo: parsed.data })
    return NextResponse.json({ produto })
  } catch (e) {
    return prismaError(e)
  }
}
