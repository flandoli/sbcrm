export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { CATALOG_TIPOS, catalogSchema } from '@/lib/admin/schemas'

// GET ?tipo=UF&ativos=1 → itens do catálogo (ativos=1 para seletores; histórico guarda o nome).
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const sp = new URL(req.url).searchParams
  const tipo = sp.get('tipo')
  if (tipo && !(CATALOG_TIPOS as readonly string[]).includes(tipo)) return jsonError('Tipo de catálogo inválido')
  const items = await prisma.catalogItem.findMany({
    where: { ...(tipo ? { tipo: tipo as (typeof CATALOG_TIPOS)[number] } : {}), ...(sp.get('ativos') === '1' ? { ativo: true } : {}) },
    orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = catalogSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  try {
    const item = await prisma.catalogItem.create({ data: parsed.data })
    await audit({ userId: user.id, acao: 'catalog.create', entidade: 'CatalogItem', entidadeId: item.id, valorNovo: parsed.data })
    return NextResponse.json({ item }, { status: 201 })
  } catch (e) {
    return prismaError(e)
  }
}
