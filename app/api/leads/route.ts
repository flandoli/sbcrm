export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { untaggedMetaWhere } from '@/lib/meta-tag-utils'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const ddd = url.searchParams.get('ddd')
  const type = url.searchParams.get('type') // 'new' | 'other'
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')
  const page = parseInt(url.searchParams.get('page') ?? '1', 10)
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

  const source = url.searchParams.get('source')
  const channel = url.searchParams.get('channel')
  const vaicrmStage = url.searchParams.get('vaicrmStage')
  const vaicrmSaleStatus = url.searchParams.get('vaicrmSaleStatus')

  const where: any = {}
  if (status) where.status = status
  if (ddd) where.ddd = ddd
  if (source) where.source = source
  // Funil Kanban CRM da Vai de Vendas (etapa).
  if (vaicrmStage) where.vaicrmStage = vaicrmStage
  // Situação de venda (tag do VCRM) — vaicrmTags é um JSON array de nomes; o
  // nome entre aspas evita casar "Matrícula" dentro de "Pós-matrícula".
  if (vaicrmSaleStatus) where.vaicrmTags = { contains: `"${vaicrmSaleStatus}"` }
  // Canal especial: leads com evidência de anúncio Meta que a Opa não etiquetou.
  if (channel === 'meta_sem_etiqueta') {
    where.AND = [untaggedMetaWhere()]
  } else if (channel === 'ssrj') {
    where.ssrj = true
  } else if (channel === 'viratecnico') {
    where.viraTecnico = true
  } else if (channel) {
    where.channel = channel
  }
  // Segmentação mutuamente exclusiva: Derrubados sai de Novos/Outros.
  // Alunos (isAluno) ficam sempre em "Outros contatos", nunca em "Novos".
  if (type === 'dropped') {
    where.isDropped = true
  } else if (type === 'new') {
    where.isNewConversation = true
    where.isDropped = false
    where.isAluno = false
  } else if (type === 'other') {
    where.isDropped = false
    where.OR = [{ isNewConversation: false }, { isAluno: true }]
  }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom + 'T00:00:00-03:00')
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999-03:00')
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ])

  return NextResponse.json({ leads, total, page, limit })
}
