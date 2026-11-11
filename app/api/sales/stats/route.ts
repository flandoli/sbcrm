export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getCombinedAdSpend } from '@/lib/ad-performance'
import { isExcludedMidia } from '@/lib/sales-utils'

const TRACKING_START_DATE = '2026-07-31'

function getDefaultDateTo(): string {
  const now = new Date()
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return sp.toISOString().slice(0, 10)
}

interface Breakdown {
  label: string
  count: number
  receita: number
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')
  // Origem: '' (geral) ou 'whatsapp' (apenas vendas casadas com leads capturados).
  // Futuramente: 'google', 'site'. Por ora, 'whatsapp' = vendas com lead casado.
  const origem = url.searchParams.get('origem') || ''

  // Filtro de período sobre dataMatricula (fuso São Paulo, UTC-3). Sem datas => todo o período.
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom + 'T00:00:00-03:00')
  if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59.999-03:00')
  const hasDate = Boolean(dateFrom || dateTo)
  const saleWhere: any = hasDate ? { dataMatricula: dateFilter } : {}
  if (origem === 'whatsapp') saleWhere.matched = true

  // Busca as vendas do período (inclui as sem dataMatricula quando sem filtro).
  const salesRaw = await prisma.sale.findMany({
    where: saleWhere,
    select: {
      valorPago: true,
      matched: true,
      curso: true,
      formaPgto: true,
      midia: true,
      midiaAjustada: true,
    },
  })
  // Remove mídias excluídas (ex.: LPSP) de tudo: matrículas, receita, ROAS e "Por mídia".
  const sales = salesRaw.filter((s) => !isExcludedMidia(s.midia))

  const matriculas = sales.length
  const receita = sales.reduce((s, v) => s + (v.valorPago ?? 0), 0)
  const ticketMedio = matriculas > 0 ? receita / matriculas : 0
  const casadas = sales.filter((s) => s.matched).length
  const naoCasadas = matriculas - casadas

  // Leads no período (createdAt) para taxa de conversão.
  const leadsWhere: any = hasDate ? { createdAt: dateFilter } : {}
  const leadsNoPeriodo = await prisma.lead.count({ where: leadsWhere })
  const conversao = leadsNoPeriodo > 0 ? (casadas / leadsNoPeriodo) * 100 : 0

  // Breakdown por curso, forma de pagamento e mídia.
  function groupBy(field: 'curso' | 'formaPgto' | 'midia' | 'midiaAjustada'): Breakdown[] {
    const map = new Map<string, { count: number; receita: number }>()
    for (const s of sales) {
      const key = (s[field] ?? '').toString().trim() || '(vazio)'
      const cur = map.get(key) ?? { count: 0, receita: 0 }
      cur.count++
      cur.receita += s.valorPago ?? 0
      map.set(key, cur)
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, count: v.count, receita: v.receita }))
      .sort((a, b) => b.count - a.count)
  }

  const porCurso = groupBy('curso')
  const porFormaPgto = groupBy('formaPgto')
  // "Por mídia" agora usa a MÍDIA AJUSTADA (classificação refinada da planilha
  // diária), não mais a mídia bruta da planilha de vendas.
  const porMidia = groupBy('midiaAjustada')

  // Investimento em anúncios (Meta + Google Ads) no mesmo período -> ROAS e CAC.
  let investimento = 0
  let metaSpend = 0
  let googleSpend = 0
  let metaConfigured = false
  let googleConfigured = false
  try {
    const adFromStr = dateFrom || TRACKING_START_DATE
    const adToStr = dateTo || getDefaultDateTo()
    const adFrom = new Date(adFromStr + 'T00:00:00-03:00')
    const adTo = new Date(adToStr + 'T23:59:59.999-03:00')
    const combined = await getCombinedAdSpend(adFrom, adTo, adFromStr, adToStr)
    metaSpend = combined.metaSpend
    googleSpend = combined.googleSpend
    investimento = combined.totalSpend
    metaConfigured = combined.metaConfigured
    googleConfigured = combined.googleConfigured
  } catch (e: any) {
    console.error('[SALES_STATS] erro ao buscar investimento:', e?.message)
  }

  const roas = investimento > 0 ? receita / investimento : 0
  const cac = matriculas > 0 && investimento > 0 ? investimento / matriculas : 0

  return NextResponse.json({
    origem,
    matriculas,
    receita,
    ticketMedio,
    casadas,
    naoCasadas,
    leadsNoPeriodo,
    conversao,
    investimento,
    metaSpend,
    googleSpend,
    roas,
    cac,
    metaConfigured,
    googleConfigured,
    porCurso,
    porFormaPgto,
    porMidia,
  })
}
