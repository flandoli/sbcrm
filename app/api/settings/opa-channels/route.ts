export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

/**
 * Auxiliar de descoberta: lista os channelIds (canais de WhatsApp/Instagram da OpaSuite)
 * observados recentemente, para ajudar a identificar cada LINHA (ex.: 21 2042-2360 = SSRJ,
 * 11 94577-7262 = Vira Técnico).
 *
 * Como a OpaSuite NÃO expõe o número da linha (apenas um channelId interno), o método de
 * identificação é: mandar uma mensagem de teste de um telefone conhecido para a linha e ver
 * em qual channelId esse telefone aparece como cliente mais recente.
 *
 * Combina duas fontes:
 *  1. Leads já salvos com opaChannelId (contagem histórica).
 *  2. Chamadas de webhook recentes (webhookLog), que carregam o channelId + telefone do cliente
 *     + horário — usadas para mostrar os últimos clientes por canal.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  interface RecentCustomer {
    phone: string
    at: string // ISO
  }
  interface ChannelEntry {
    channelId: string
    channelType?: string
    leads: number
    webhookHits: number
    lastActivity?: string // ISO
    recentCustomers: RecentCustomer[]
  }

  const counts = new Map<string, ChannelEntry>()

  // 1. Leads com opaChannelId (contagem histórica + última atividade)
  try {
    const grouped = await prisma.lead.groupBy({
      by: ['opaChannelId'],
      where: { opaChannelId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
    })
    for (const g of grouped) {
      const id = String(g.opaChannelId)
      const entry = counts.get(id) ?? { channelId: id, leads: 0, webhookHits: 0, recentCustomers: [] }
      entry.leads = g._count._all
      if (g._max.createdAt) entry.lastActivity = g._max.createdAt.toISOString()
      counts.set(id, entry)
    }
  } catch {}

  // 2. Webhook logs recentes (até 50) -> últimos clientes por canal + horário
  try {
    const logs = await prisma.webhookLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
    for (const l of logs) {
      try {
        const b = JSON.parse(l.payload)
        const opa = b?.event?.data?.payload ?? b?.data?.payload
        const id = opa?.channelId
        if (!id) continue
        const key = String(id)
        const entry = counts.get(key) ?? { channelId: key, leads: 0, webhookHits: 0, recentCustomers: [] }
        entry.webhookHits += 1
        if (!entry.channelType && typeof opa?.channelType === 'string') entry.channelType = opa.channelType
        const at = l.createdAt.toISOString()
        if (!entry.lastActivity || at > entry.lastActivity) entry.lastActivity = at
        if (typeof opa?.customerChannel === 'string') {
          const phone = opa.customerChannel.split('@')[0]
          if (phone && entry.recentCustomers.length < 6 && !entry.recentCustomers.some((c) => c.phone === phone)) {
            entry.recentCustomers.push({ phone, at })
          }
        }
        counts.set(key, entry)
      } catch {}
    }
  } catch {}

  const list = [...counts.values()].sort((a, b) => {
    // Ordena por atividade mais recente (webhook), depois por volume de leads.
    const at = a.lastActivity ?? ''
    const bt = b.lastActivity ?? ''
    if (at !== bt) return bt.localeCompare(at)
    return b.leads - a.leads
  })
  return NextResponse.json({ channels: list })
}
