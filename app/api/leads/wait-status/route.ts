export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { refreshLeadWaitStates } from '@/lib/opasuite-wait-state'

// POST { ids: string[] } → estado de espera (aguardando atendente / cliente)
// dos leads em aberto, consultado na OpaSuite com cache de 2 minutos.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : []
    if (ids.length === 0) return NextResponse.json({ states: [] })
    const states = await refreshLeadWaitStates(ids)
    return NextResponse.json({ states })
  } catch (e: any) {
    console.error('[WAIT_STATUS] erro:', e?.message)
    return NextResponse.json({ error: 'Falha ao consultar status' }, { status: 500 })
  }
}
