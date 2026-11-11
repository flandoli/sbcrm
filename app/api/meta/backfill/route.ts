export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { backfillMetaFunnel } from '@/lib/meta-purchase'

/**
 * Envia retroativamente o funil (Lead / QualifiedLead / Purchase) à Meta para
 * os leads e vendas de origem Meta dos últimos `days` dias (default 60).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let days = 60
  try {
    const body = await req.json().catch(() => ({}))
    if (body && typeof body.days === 'number' && body.days > 0 && body.days <= 62) {
      days = Math.floor(body.days)
    }
  } catch {}

  try {
    const result = await backfillMetaFunnel(days)
    return NextResponse.json({ ok: true, days, result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro interno' }, { status: 500 })
  }
}
