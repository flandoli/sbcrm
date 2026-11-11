export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { getGoogleAdPerformance } from '@/lib/google-ad-performance'

const TRACKING_START_DATE = '2026-07-31'

function getDefaultDateTo(): string {
  const now = new Date()
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return sp.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom') || TRACKING_START_DATE
  const dateTo = url.searchParams.get('dateTo') || getDefaultDateTo()

  const fromDate = new Date(dateFrom + 'T00:00:00-03:00')
  const toDate = new Date(dateTo + 'T23:59:59.999-03:00')

  try {
    const result = await getGoogleAdPerformance(fromDate, toDate, dateFrom, dateTo)
    return NextResponse.json({ dateFrom, dateTo, ...result })
  } catch (e: any) {
    console.error('[GOOGLE_AD_PERF] erro:', e?.message)
    return NextResponse.json({ error: e?.message || 'Erro ao calcular performance' }, { status: 200 })
  }
}
