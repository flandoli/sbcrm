export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, hasRole } from '@/lib/session'

// Consulta do AuditLog — Admin e Diretor.
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!hasRole(user, 'ADMIN', 'DIRETOR')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const url = new URL(req.url)
  const entidade = url.searchParams.get('entidade') ?? undefined
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))

  const logs = await prisma.auditLog.findMany({
    where: entidade ? { entidade } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  })
  return NextResponse.json({ logs })
}
