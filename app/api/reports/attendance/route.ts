export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { getAttendanceReport, type LeadGroup } from '@/lib/reports/attendance'

const GROUPS: LeadGroup[] = ['monitor', 'etssr', 'vira']

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')
    const g = url.searchParams.get('group') ?? ''
    const report = await getAttendanceReport({
      from: dateFrom ? new Date(dateFrom + 'T00:00:00-03:00') : undefined,
      to: dateTo ? new Date(dateTo + 'T23:59:59.999-03:00') : undefined,
      group: GROUPS.includes(g as LeadGroup) ? (g as LeadGroup) : '',
      includeFiltered: url.searchParams.get('includeFiltered') === '1',
    })
    return NextResponse.json(report)
  } catch (e) {
    console.error('[REPORTS_ATTENDANCE]', e)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}
