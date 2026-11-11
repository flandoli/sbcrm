import { getAdPerformance } from '@/lib/ad-performance'
import { getGoogleAdPerformance } from '@/lib/google-ad-performance'
import { prisma } from '@/lib/prisma'

/**
 * Retorno sobre o investimento (ROI) dos leads de WhatsApp.
 *
 * Receita atribuída por Grupo Macro (planilha de classificação de mídia do
 * usuário, persistida em Sale.grupoMacro). Apenas GOOGLE e META têm mídia
 * paga (ROAS calculável). Os demais grupos (IA, CELERA, CHATGPT, ACTIVE,
 * GOOGLE_META) são orgânicos/parceria — receita exibida sem ROAS.
 *
 * Spend:
 *  - Meta  = campanhas monitoradas (getAdPerformance).
 *  - Google = conta inteira (getGoogleAdPerformance.totalSpend).
 *
 * Vendas sem grupoMacro preenchido entram no bucket "NÃO CLASSIFICADO".
 * Grupo "NÃO USAR" (RM, outra área) é excluído.
 */

export interface RoiFront {
  spend: number
  receita: number
  vendas: number
  roas: number | null
  lucro: number
  margem: number | null
}

export interface OrganicGroup {
  grupo: string
  receita: number
  vendas: number
}

export interface RoiSummary {
  metaConfigured: boolean
  googleConfigured: boolean
  total: RoiFront
  meta: RoiFront
  google: RoiFront
  googlePlatform: {
    convValue: number
    conversions: number
    roas: number | null
  }
  organicGroups: OrganicGroup[]
  unclassified: { receita: number; vendas: number }
}

function buildFront(spend: number, receita: number, vendas: number): RoiFront {
  return {
    spend,
    receita,
    vendas,
    roas: spend > 0 ? receita / spend : null,
    lucro: receita - spend,
    margem: receita > 0 ? (receita - spend) / receita : null,
  }
}

const EXCLUDED_MACRO = ['NÃO USAR']
const PAID_MACROS = ['GOOGLE', 'META']

export async function getRoiSummary(
  fromDate: Date,
  toDate: Date,
  dateFromStr: string,
  dateToStr: string,
): Promise<RoiSummary> {
  // 1) Spend: Meta + Google em paralelo
  const [metaRes, googleRes] = await Promise.all([
    getAdPerformance(fromDate, toDate, dateFromStr, dateToStr, { excludeGoogleOrigin: true }).catch((e: any) => {
      console.error('[ROI_SUMMARY] erro Meta:', e?.message)
      return { rows: [] as any[], metaConfigured: false }
    }),
    getGoogleAdPerformance(fromDate, toDate, dateFromStr, dateToStr).catch((e: any) => {
      console.error('[ROI_SUMMARY] erro Google:', e?.message)
      return {
        rows: [] as any[],
        googleConfigured: false,
        totalSpend: 0,
        totalLeads: 0,
        totalQualificados: 0,
        totalMatriculas: 0,
        totalReceita: 0,
        totalGConversions: 0,
        totalGConvValue: 0,
        totalMatriculasBroad: 0,
        totalReceitaBroad: 0,
      }
    }),
  ])

  const metaSpend = metaRes.rows.reduce((s, r) => s + (r.spend ?? 0), 0)
  const googleSpend = googleRes.totalSpend
  const googleConvValue = googleRes.totalGConvValue ?? 0
  const googleConversions = googleRes.totalGConversions ?? 0

  // 2) Receita por grupoMacro (vendas com dataMatricula no período)
  const revenueByMacro = await prisma.sale.groupBy({
    by: ['grupoMacro'],
    where: {
      dataMatricula: { gte: fromDate, lte: toDate },
      grupoMacro: { notIn: EXCLUDED_MACRO },
    },
    _sum: { valorPago: true },
    _count: { id: true },
  })

  let metaReceita = 0, metaVendas = 0
  let googleReceita = 0, googleVendas = 0
  const organicGroups: OrganicGroup[] = []
  let unclassifiedReceita = 0, unclassifiedVendas = 0

  for (const row of revenueByMacro) {
    const grupo = row.grupoMacro ?? null
    const receita = row._sum.valorPago ?? 0
    const vendas = row._count.id
    if (grupo === 'META') {
      metaReceita = receita; metaVendas = vendas
    } else if (grupo === 'GOOGLE') {
      googleReceita = receita; googleVendas = vendas
    } else if (grupo === null) {
      unclassifiedReceita = receita; unclassifiedVendas = vendas
    } else {
      organicGroups.push({ grupo, receita, vendas })
    }
  }

  // Ordenar orgânicos por receita desc
  organicGroups.sort((a, b) => b.receita - a.receita)

  return {
    metaConfigured: metaRes.metaConfigured,
    googleConfigured: googleRes.googleConfigured,
    total: buildFront(metaSpend + googleSpend, metaReceita + googleReceita, metaVendas + googleVendas),
    meta: buildFront(metaSpend, metaReceita, metaVendas),
    google: buildFront(googleSpend, googleReceita, googleVendas),
    googlePlatform: {
      convValue: googleConvValue,
      conversions: googleConversions,
      roas: googleSpend > 0 ? googleConvValue / googleSpend : null,
    },
    organicGroups,
    unclassified: { receita: unclassifiedReceita, vendas: unclassifiedVendas },
  }
}
