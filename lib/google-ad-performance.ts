import { prisma } from '@/lib/prisma'
import { getGoogleAdsSpend, isGoogleAdsConfigured, type GoogleAdsCampaignSpend } from '@/lib/google-ads'

export interface GoogleAdPerformanceRow {
  campaignId: string     // utm_campaign (pode ser nome ou ID numérico da campanha)
  campaignName: string   // Nome real da campanha (resolvido via API)
  leads: number
  qualificados: number
  matriculas: number     // Vendas casadas de leads desta campanha
  receita: number        // Receita das matrículas casadas
  spend: number          // Gasto no período (API do Google Ads)
  cpl: number            // Custo por lead
  cpql: number           // Custo por lead qualificado
  cac: number            // Custo por matrícula (cruzamento por telefone)
  roas: number           // Retorno sobre investimento por cruzamento (receita / spend)
  gConversions: number   // Conversões atribuídas pelo Google (tags GTM/GA)
  gConvValue: number     // Valor/receita atribuído pelo Google
  gRoas: number          // ROAS pela atribuição do Google (gConvValue / spend)
}

/**
 * Resolve utm_campaign (que pode ser um campaignId numérico) para o spend real
 * da campanha no Google Ads. Faz match por ID numérico ou por nome.
 */
function matchCampaignSpend(
  utmCampaign: string,
  googleCampaigns: GoogleAdsCampaignSpend[],
): GoogleAdsCampaignSpend | undefined {
  // Tenta casar por ID numérico (utm_campaign = campaignId do Google)
  const byId = googleCampaigns.find(c => c.campaignId === utmCampaign)
  if (byId) return byId
  // Tenta casar por nome (case-insensitive)
  return googleCampaigns.find(c =>
    c.campaignName.toLowerCase() === utmCampaign.toLowerCase()
  )
}

interface LeadCampaignAgg {
  utmCampaign: string
  leads: number
  qualificados: number
}

/**
 * Busca performance por campanha Google:
 * - Agrupa leads (channel = 'pago_google') por utmCampaign
 * - Busca spend do Google Ads pela API
 * - Cruza vendas casadas (Sales com matched=true cujo Lead tem channel='pago_google')
 */
export async function getGoogleAdPerformance(
  fromDate: Date,
  toDate: Date,
  dateFromStr: string,
  dateToStr: string,
): Promise<{
  rows: GoogleAdPerformanceRow[]
  googleConfigured: boolean
  totalSpend: number
  totalLeads: number
  totalQualificados: number
  totalMatriculas: number
  totalReceita: number
  totalGConversions: number
  totalGConvValue: number
  // Atribuição AMPLA da representatividade do Google: matrículas cuja mídia
  // reportada pelo CRM é HTTP (formulário do site), GOOGLE ou LEADST (Leadster),
  // mesmo que o lead tenha chegado como "direto" ou sem origem certa. Exclui as
  // vendas já creditadas a anúncios da Meta (lead com adId) para não duplicar no
  // total. Reflete que o Google traz a maior parte do tráfego para o site.
  totalMatriculasBroad: number
  totalReceitaBroad: number
}> {
  const googleConfigured = isGoogleAdsConfigured()

  // 1) Agrupa leads Google por utmCampaign
  const agg: LeadCampaignAgg[] = await prisma.$queryRaw`
    SELECT
      COALESCE("utmCampaign", "campaignName", '(sem campanha)') AS "utmCampaign",
      COUNT(*)::int AS "leads",
      COUNT(*) FILTER (WHERE "status" = 'QUALIFICADO')::int AS "qualificados"
    FROM "Lead"
    WHERE "createdAt" >= ${fromDate}
      AND "createdAt" <= ${toDate}
      AND "channel" = 'pago_google'
      AND "isNewConversation" = true
      AND "isAluno" = false
    GROUP BY COALESCE("utmCampaign", "campaignName", '(sem campanha)')
    ORDER BY "leads" DESC
  `

  // 2) Busca matrículas casadas com leads Google no período
  const salesAgg: Array<{ utmCampaign: string; matriculas: number; receita: number }> = await prisma.$queryRaw`
    SELECT
      COALESCE(l."utmCampaign", l."campaignName", '(sem campanha)') AS "utmCampaign",
      COUNT(s.id)::int AS "matriculas",
      COALESCE(SUM(s."valorPago"), 0)::float AS "receita"
    FROM "Sale" s
    INNER JOIN "Lead" l ON s."leadId" = l.id
    WHERE s."matched" = true
      AND l."channel" = 'pago_google'
      AND s."dataMatricula" >= ${fromDate}
      AND s."dataMatricula" <= ${toDate}
    GROUP BY COALESCE(l."utmCampaign", l."campaignName", '(sem campanha)')
  `
  const salesMap = new Map(salesAgg.map(s => [s.utmCampaign, s]))

  // 3) Busca spend do Google Ads pela API
  let googleCampaigns: GoogleAdsCampaignSpend[] = []
  let apiTotalSpend = 0
  if (googleConfigured) {
    try {
      const gResult = await getGoogleAdsSpend(dateFromStr, dateToStr)
      googleCampaigns = gResult.campaigns
      apiTotalSpend = gResult.totalSpend
    } catch (e: any) {
      console.error('[GOOGLE_AD_PERF] erro API:', e?.message)
    }
  }

  // Mapas de spend: por ID numérico e por nome (case-insensitive)
  const spendByIdMap = new Map<string, number>()
  const spendByNameMap = new Map<string, number>()
  const convByIdMap = new Map<string, number>()
  const convByNameMap = new Map<string, number>()
  const convValByIdMap = new Map<string, number>()
  const convValByNameMap = new Map<string, number>()
  const nameByIdMap = new Map<string, string>()  // campaignId → campaignName (resolve nomes)
  for (const c of googleCampaigns) {
    const lname = c.campaignName.toLowerCase()
    spendByIdMap.set(c.campaignId, (spendByIdMap.get(c.campaignId) ?? 0) + c.spend)
    spendByNameMap.set(lname, (spendByNameMap.get(lname) ?? 0) + c.spend)
    convByIdMap.set(c.campaignId, (convByIdMap.get(c.campaignId) ?? 0) + c.conversions)
    convByNameMap.set(lname, (convByNameMap.get(lname) ?? 0) + c.conversions)
    convValByIdMap.set(c.campaignId, (convValByIdMap.get(c.campaignId) ?? 0) + c.conversionsValue)
    convValByNameMap.set(lname, (convValByNameMap.get(lname) ?? 0) + c.conversionsValue)
    nameByIdMap.set(c.campaignId, c.campaignName)
  }

  // 4) Monta rows cruzando tudo
  // Começa com as campanhas que têm leads
  const seenCampaigns = new Set<string>()
  const rows: GoogleAdPerformanceRow[] = []

  for (const a of agg) {
    const sales = salesMap.get(a.utmCampaign)
    const matriculas = sales?.matriculas ?? 0
    const receita = sales?.receita ?? 0
    // Tenta match do spend por ID numérico, depois por nome
    const lutm = a.utmCampaign.toLowerCase()
    const spend = spendByIdMap.get(a.utmCampaign) ?? spendByNameMap.get(lutm) ?? 0
    const gConversions = convByIdMap.get(a.utmCampaign) ?? convByNameMap.get(lutm) ?? 0
    const gConvValue = convValByIdMap.get(a.utmCampaign) ?? convValByNameMap.get(lutm) ?? 0
    // Resolve nome real da campanha (se utm_campaign é um ID numérico)
    const resolvedName = nameByIdMap.get(a.utmCampaign) ?? a.utmCampaign
    seenCampaigns.add(a.utmCampaign.toLowerCase())
    if (nameByIdMap.has(a.utmCampaign)) seenCampaigns.add(nameByIdMap.get(a.utmCampaign)!.toLowerCase())

    rows.push({
      campaignId: a.utmCampaign,
      campaignName: resolvedName,
      leads: a.leads,
      qualificados: a.qualificados,
      matriculas,
      receita,
      spend,
      cpl: a.leads > 0 ? spend / a.leads : 0,
      cpql: a.qualificados > 0 ? spend / a.qualificados : 0,
      cac: matriculas > 0 ? spend / matriculas : 0,
      roas: spend > 0 ? receita / spend : 0,
      gConversions,
      gConvValue,
      gRoas: spend > 0 ? gConvValue / spend : 0,
    })
  }

  // Adiciona campanhas do Google Ads que tiveram spend > 0 mas 0 leads (para visibilidade)
  for (const c of googleCampaigns) {
    if (c.spend > 0 && !seenCampaigns.has(c.campaignName.toLowerCase())) {
      seenCampaigns.add(c.campaignName.toLowerCase())
      rows.push({
        campaignId: c.campaignName,
        campaignName: c.campaignName,
        leads: 0,
        qualificados: 0,
        matriculas: 0,
        receita: 0,
        spend: c.spend,
        cpl: 0,
        cpql: 0,
        cac: 0,
        roas: 0,
        gConversions: c.conversions,
        gConvValue: c.conversionsValue,
        gRoas: c.spend > 0 ? c.conversionsValue / c.spend : 0,
      })
    }
  }

  // Ordena por spend desc, depois leads desc
  rows.sort((a, b) => b.spend - a.spend || b.leads - a.leads)

  const totalLeads = agg.reduce((s, a) => s + a.leads, 0)
  const totalQualificados = agg.reduce((s, a) => s + a.qualificados, 0)
  const totalMatriculas = [...salesMap.values()].reduce((s, v) => s + v.matriculas, 0)
  const totalReceita = [...salesMap.values()].reduce((s, v) => s + v.receita, 0)
  const totalGConversions = googleCampaigns.reduce((s, c) => s + c.conversions, 0)
  const totalGConvValue = googleCampaigns.reduce((s, c) => s + c.conversionsValue, 0)

  // Atribuição AMPLA: matrículas por mídia reportada (HTTP/GOOGLE/LEADST) no
  // período, independentemente do canal/origem do lead (inclui "direto" e sem
  // origem certa). Exclui vendas já atribuídas a anúncios da Meta (lead com adId
  // e canal != pago_google) para manter as frentes disjuntas no total.
  const broadAgg: Array<{ matriculas: number; receita: number }> = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS "matriculas",
      COALESCE(SUM(s."valorPago"), 0)::float AS "receita"
    FROM "Sale" s
    LEFT JOIN "Lead" l ON s."leadId" = l.id
    WHERE s."dataMatricula" >= ${fromDate}
      AND s."dataMatricula" <= ${toDate}
      AND UPPER(s."midia") IN ('HTTP', 'GOOGLE', 'LEADST')
      AND NOT (
        s."matched" = true
        AND l."adId" IS NOT NULL AND l."adId" <> ''
        AND l."channel" IS DISTINCT FROM 'pago_google'
      )
  `
  const totalMatriculasBroad = broadAgg[0]?.matriculas ?? 0
  const totalReceitaBroad = broadAgg[0]?.receita ?? 0

  return {
    rows,
    googleConfigured,
    totalSpend: apiTotalSpend,
    totalLeads,
    totalQualificados,
    totalMatriculas,
    totalReceita,
    totalGConversions,
    totalGConvValue,
    totalMatriculasBroad,
    totalReceitaBroad,
  }
}
