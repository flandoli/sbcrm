export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getMonitoredCampaignIds, isCampaignIncluded } from '@/lib/meta-campaign-filter'

const META_ADS_TOKEN = process.env.META_ADS_TOKEN ?? process.env.META_CAPI_TOKEN ?? ''
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID ?? ''

interface MetaCampaignInsight {
  campaign_name: string
  campaign_id: string
  impressions: string
  clicks: string
  spend: string
  actions?: Array<{ action_type: string; value: string }>
  date_start: string
  date_stop: string
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!META_AD_ACCOUNT_ID || !META_ADS_TOKEN) {
    return NextResponse.json({
      error: 'Meta Ads não configurado',
      configured: false,
      needsSetup: true,
    }, { status: 200 })
  }

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom') || getDefaultDateFrom()
  const dateTo = url.searchParams.get('dateTo') || getDefaultDateTo()

  try {
    // 0) Ler campanhas monitoradas selecionadas pelo usuário (se houver)
    const monitoredIds = await getMonitoredCampaignIds()

    // 1) Buscar métricas da Meta Marketing API
    const metaData = await fetchMetaInsights(dateFrom, dateTo)

    // 2) Buscar contagem de leads nossos no mesmo período
    const fromDate = new Date(dateFrom + 'T00:00:00-03:00')
    const toDate = new Date(dateTo + 'T23:59:59.999-03:00')

    const [totalLeads, novosContatos, fromAds, qualificados] = await Promise.all([
      prisma.lead.count({
        where: { createdAt: { gte: fromDate, lte: toDate } },
      }),
      prisma.lead.count({
        where: { createdAt: { gte: fromDate, lte: toDate }, isNewConversation: true },
      }),
      prisma.lead.count({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          isNewConversation: true,
          isAluno: false,
          OR: [{ adId: { not: null } }, { channel: 'pago_meta' }],
        },
      }),
      prisma.lead.count({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          status: 'QUALIFICADO',
          isNewConversation: true,
          isAluno: false,
        },
      }),
    ])

    // 2b) Leads de anúncio agrupados por dia (fuso SP)
    const leadsPerDay: Array<{ day: string; count: bigint }> = await prisma.$queryRaw`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS count
      FROM "Lead"
      WHERE "createdAt" >= ${fromDate}
        AND "createdAt" <= ${toDate}
        AND "isNewConversation" = true
        AND "isAluno" = false
        AND ("adId" IS NOT NULL OR "channel" = 'pago_meta')
      GROUP BY day
      ORDER BY day
    `
    const leadsPerDayMap: Record<string, number> = {}
    for (const r of leadsPerDay) {
      leadsPerDayMap[r.day] = Number(r.count)
    }

    // 3) Agregar dados da Meta (totais + por dia)
    let totalImpressions = 0
    let totalClicks = 0
    let totalSpend = 0
    let totalConversationsStarted = 0
    const campaigns: Array<{
      name: string
      id: string
      impressions: number
      clicks: number
      spend: number
      conversationsStarted: number
    }> = []
    // Agregar conversas Meta por dia
    const metaPerDayMap: Record<string, number> = {}

    for (const insight of metaData) {
      // Mesmo critério aplicado no restante do app (util compartilhado):
      // campanhas selecionadas pelo usuário ou, sem seleção, exclui as padrão.
      if (!isCampaignIncluded(insight.campaign_id, insight.campaign_name, monitoredIds)) continue

      const impressions = parseInt(insight.impressions || '0', 10)
      const clicks = parseInt(insight.clicks || '0', 10)
      const spend = parseFloat(insight.spend || '0')
      const convStarted = extractConversations(insight.actions)

      totalImpressions += impressions
      totalClicks += clicks
      totalSpend += spend
      totalConversationsStarted += convStarted

      // Acumular por campanha (aggregated)
      const existingCamp = campaigns.find(c => c.id === insight.campaign_id)
      if (existingCamp) {
        existingCamp.impressions += impressions
        existingCamp.clicks += clicks
        existingCamp.spend += spend
        existingCamp.conversationsStarted += convStarted
      } else {
        campaigns.push({
          name: insight.campaign_name,
          id: insight.campaign_id,
          impressions,
          clicks,
          spend,
          conversationsStarted: convStarted,
        })
      }

      // Acumular conversas por dia (date_start = YYYY-MM-DD do insight diário)
      const day = insight.date_start
      if (day) {
        metaPerDayMap[day] = (metaPerDayMap[day] || 0) + convStarted
      }
    }

    // 4) Montar array de diferença diária
    const allDays = new Set([...Object.keys(metaPerDayMap), ...Object.keys(leadsPerDayMap)])
    const dailyDiff = Array.from(allDays).sort().map(day => {
      const metaConv = metaPerDayMap[day] || 0
      const opaLeads = leadsPerDayMap[day] || 0
      return { date: day, metaConversas: metaConv, opaLeads, diff: metaConv - opaLeads }
    })

    return NextResponse.json({
      configured: true,
      dateFrom,
      dateTo,
      meta: {
        impressions: totalImpressions,
        clicks: totalClicks,
        spend: totalSpend,
        conversationsStarted: totalConversationsStarted,
      },
      internal: {
        totalLeads,
        novosContatos,
        fromAds,
        qualificados,
      },
      campaigns: campaigns.sort((a, b) => b.conversationsStarted - a.conversationsStarted),
      dailyDiff,
    })
  } catch (e: any) {
    console.error('[META_FUNNEL] erro:', e.message)
    return NextResponse.json({
      error: e.message || 'Erro ao buscar dados da Meta',
      configured: true,
    }, { status: 200 })
  }
}

async function fetchMetaInsights(dateFrom: string, dateTo: string): Promise<MetaCampaignInsight[]> {
  const accountId = META_AD_ACCOUNT_ID.startsWith('act_')
    ? META_AD_ACCOUNT_ID
    : `act_${META_AD_ACCOUNT_ID}`

  const fields = 'campaign_name,campaign_id,impressions,clicks,spend,actions'
  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    time_increment: '1',  // breakdown diário
    level: 'campaign',
    access_token: META_ADS_TOKEN,
    limit: '500',
  })

  const url = `https://graph.facebook.com/v21.0/${accountId}/insights?${params.toString()}`
  console.log('[META_FUNNEL] buscando insights:', accountId, dateFrom, '→', dateTo)

  const res = await fetch(url, { next: { revalidate: 0 } })
  const json = await res.json()

  if (json.error) {
    console.error('[META_FUNNEL] erro da API:', json.error.message)
    throw new Error(json.error.message)
  }

  const results: MetaCampaignInsight[] = json.data || []

  // Paginação
  let nextUrl = json.paging?.next
  while (nextUrl) {
    const pageRes = await fetch(nextUrl)
    const pageJson = await pageRes.json()
    if (pageJson.data) results.push(...pageJson.data)
    nextUrl = pageJson.paging?.next
  }

  return results
}

function extractConversations(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0
  // Tipos de ação que indicam conversa iniciada no WhatsApp/Messenger
  const convTypes = [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'messaging_conversation_started_7d',
  ]
  let total = 0
  for (const a of actions) {
    if (convTypes.includes(a.action_type)) {
      total += parseInt(a.value || '0', 10)
    }
  }
  return total
}

// Data em que o rastreamento de leads começou (primeiro lead: 31/07/2026).
// Antes disso não temos dados internos, então a comparação do funil não faz
// sentido. Por padrão puxamos as campanhas desde essa data "daqui para frente".
const TRACKING_START_DATE = '2026-07-31'

function getDefaultDateFrom(): string {
  return TRACKING_START_DATE
}

function getDefaultDateTo(): string {
  // Data de hoje no fuso de São Paulo (UTC-3)
  const now = new Date()
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return sp.toISOString().slice(0, 10)
}
