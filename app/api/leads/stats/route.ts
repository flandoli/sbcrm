export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')
  const where: Prisma.LeadWhereInput = {}
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom + 'T00:00:00-03:00') } : {}),
      ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999-03:00') } : {}),
    }
  }

  const [total, byStatus, byChannel] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['channel'], where, _count: { _all: true } }),
  ])

  const status: Record<string, number> = {}
  for (const r of byStatus) status[r.status] = r._count._all
  const channels: Record<string, number> = {}
  for (const r of byChannel) channels[r.channel ?? 'sem_canal'] = r._count._all

  return NextResponse.json({ total, status, channels })
}
