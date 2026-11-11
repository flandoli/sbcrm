export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const ddd = url.searchParams.get('ddd')
  const source = url.searchParams.get('source')
  const channel = url.searchParams.get('channel')
  const q = url.searchParams.get('q')?.trim()
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))

  const where: Prisma.LeadWhereInput = {}
  if (status) where.status = status as Prisma.LeadWhereInput['status']
  if (ddd) where.ddd = ddd
  if (source) where.source = source
  if (channel) where.channel = channel
  if (q) {
    const digits = q.replace(/\D/g, '')
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      ...(digits ? [{ phoneNormalized: { contains: digits } }] : []),
    ]
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom + 'T00:00:00-03:00') } : {}),
      ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999-03:00') } : {}),
    }
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.lead.count({ where }),
  ])

  return NextResponse.json({ leads, total, page, limit })
}
