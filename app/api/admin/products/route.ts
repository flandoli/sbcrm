export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { productSchema } from '@/lib/admin/schemas'

// Catálogo de produtos/serviços (sem preço na v1) + resumo da árvore de categorias.

export async function GET() {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const [produtos, porDepartamento] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ ativo: 'desc' }, { codigo: 'asc' }] }),
    prisma.productCategory.findMany({
      where: { nivel: 1 },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, ativo: true, _count: { select: { filhos: true } } },
    }),
  ])
  const porNivel = await prisma.productCategory.groupBy({ by: ['nivel'], _count: true, orderBy: { nivel: 'asc' } })
  return NextResponse.json({ produtos, departamentos: porDepartamento, porNivel: porNivel.map((n) => ({ nivel: n.nivel, total: n._count })) })
}

export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = productSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  try {
    const produto = await prisma.product.create({ data: parsed.data })
    await audit({ userId: user.id, acao: 'product.create', entidade: 'Product', entidadeId: produto.id, valorNovo: parsed.data })
    return NextResponse.json({ produto })
  } catch (e) {
    return prismaError(e)
  }
}
