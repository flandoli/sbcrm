export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { refreshLeadWaitStates } from '@/lib/opasuite-wait-state'

// POST: Scan retroativo dos leads "parados no robô".
// Varre os leads em aberto (com conversa na OpaSuite) de um período recente,
// reconsulta a OpaSuite (forçando, sem cache) e persiste botStuck/botStuckStage.
// Body opcional: { days?: number } (padrão 2 = ontem + hoje).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let days = 2
  try {
    const body = await req.json().catch(() => ({}))
    if (body && Number.isFinite(body.days) && body.days > 0 && body.days <= 31) days = Math.floor(body.days)
  } catch {}

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: { gte: since },
      opasuiteConversationId: { not: null },
      openedAt: { not: null },
      closedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  const ids = leads.map((l) => l.id)
  let stuck = 0
  let optin = 0
  let welcome = 0
  // refreshLeadWaitStates processa até 60 ids por chamada — fatiar.
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60)
    const infos = await refreshLeadWaitStates(chunk, true)
    for (const info of infos) {
      if (info.botStuck) {
        stuck++
        if (info.botStuckStage === 'optin') optin++
        else if (info.botStuckStage === 'welcome') welcome++
      }
    }
  }

  return NextResponse.json({ scanned: ids.length, stuck, optin, welcome })
}
