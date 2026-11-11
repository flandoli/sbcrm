export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { excludedMidiaWhere } from '@/lib/sales-utils'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')
  const matchFilter = url.searchParams.get('match') // 'matched' | 'unmatched' | ''
  const search = (url.searchParams.get('search') || '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)))

  const where: any = { AND: [excludedMidiaWhere] }
  if (dateFrom || dateTo) {
    where.dataMatricula = {}
    if (dateFrom) where.dataMatricula.gte = new Date(dateFrom + 'T00:00:00-03:00')
    if (dateTo) where.dataMatricula.lte = new Date(dateTo + 'T23:59:59.999-03:00')
  }
  if (matchFilter === 'matched') where.matched = true
  if (matchFilter === 'unmatched') where.matched = false
  if (search) {
    where.OR = [
      { nome: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { curso: { contains: search, mode: 'insensitive' } },
      { matricula: { contains: search, mode: 'insensitive' } },
      { phoneRaw: { contains: search } },
    ]
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: [{ dataMatricula: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            status: true,
            channel: true,
            adTitle: true,
            campaignName: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.sale.count({ where }),
  ])

  return NextResponse.json({ sales, total, page, limit })
}
