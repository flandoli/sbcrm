export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const logs = await prisma.webhookLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return NextResponse.json(logs)
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const result = await prisma.webhookLog.deleteMany({})
  return NextResponse.json({ deleted: result.count })
}
