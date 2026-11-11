import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getGoogleAdsSpend, isGoogleAdsConfigured, type GoogleAdsCampaignSpend } from '@/lib/google-ads'
import { EXCLUDED_MIDIA } from '@/lib/sales-utils'
import { getMonitoredCampaignIds, isCampaignIncluded } from '@/lib/meta-campaign-filter'

const META_ADS_TOKEN = process.env.META_ADS_TOKEN ?? process.env.META_CAPI_TOKEN ?? ''
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID ?? ''

export interface AdPerformanceRow {
  adId: string
  adName: string       // Nome real do anúncio na Meta (ou título/headline como fallback)
  campaignName: string
  leads: number        // Novos contatos de anúncio (não-alunos) atribuídos a este anúncio
  qualificados: number
  vendas: number       // Matrículas geradas por leads deste anúncio no período (exclui mídia LPSP)
  receita: number      // Soma de valorPago das matrículas atribuídas a este anúncio (exclui LPSP)
  spend: number        // Gasto da Meta neste anúncio no período (0 se indisponível)
  costPerLead: number  // spend / leads
  adUrl: string | null
}

interface LeadAgg {
  adId: string
  adTitle: string | null
  campaignName: string | null
  adUrl: string | null
  leads: number
  qualificados: number
}

interface MetaAdInsight {
  ad_id?: string
  ad_name?: string
  campaign_name?: string
  campaign_id?: string
  spend?: string
}

/**
 * Busca insights por ANÚNCIO (level=ad) na Meta Marketing API para o período,
 * retornando um mapa adId -> { nome real, gasto, campanha }.
 * Retorna mapa vazio se a Meta não estiver configurada ou em caso de erro.
 */
async function fetchAdInsights(
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, { name: string; spend: number; campaignName: string; campaignId: string }>> {
  if (!META_ADS_TOKEN || !META_AD_ACCOUNT_ID) return {}

  const accountId = META_AD_ACCOUNT_ID.startsWith('act_')
    ? META_AD_ACCOUNT_ID
    : `act_${META_AD_ACCOUNT_ID}`

  const params = new URLSearchParams({
    fields: 'ad_id,ad_name,campaign_name,campaign_id,spend',
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    level: 'ad',
    access_token: META_ADS_TOKEN,
    limit: '500',
  })

  const map: Record<string, { name: string; spend: number; campaignName: string; campaignId: string }> = {}

  try {
    let url: string | undefined =
      `https://graph.facebook.com/v21.0/${accountId}/insights?${params.toString()}`
    while (url) {
      const res: Response = await fetch(url, { next: { revalidate: 0 } })
      const json: any = await res.json()
      if (json.error) {
        console.error('[AD_PERFORMANCE] erro da API Meta:', json.error.message)
        break
      }
      const rows: MetaAdInsight[] = json.data || []
      for (const r of rows) {
        if (!r.ad_id) continue
        // Um mesmo anúncio pode aparecer em múltiplas linhas: acumula gasto.
        const prev = map[r.ad_id]
        map[r.ad_id] = {
          name: r.ad_name ?? prev?.name ?? '',
          campaignName: r.campaign_name ?? prev?.campaignName ?? '',
          campaignId: r.campaign_id ?? prev?.campaignId ?? '',
          spend: (prev?.spend ?? 0) + parseFloat(r.spend || '0'),
        }
      }
      url = json.paging?.next
    }
  } catch (e: any) {
    console.error('[AD_PERFORMANCE] falha ao buscar insights:', e?.message)
  }

  return map
}

/**
 * Agrega performance por anúncio no período: cruza os leads internos
 * (agrupados por adId) com o nome real do anúncio e o gasto vindos da Meta.
 * Considera apenas novos contatos de anúncio e exclui alunos, alinhado com o
 * funil e os cards do painel.
 */
export async function getAdPerformance(
  fromDate: Date,
  toDate: Date,
  dateFromStr: string,
  dateToStr: string,
  opts?: { excludeGoogleOrigin?: boolean },
): Promise<{ rows: AdPerformanceRow[]; metaConfigured: boolean }> {
  // Quando excludeGoogleOrigin=true, remove leads/vendas cujo canal é
  // 'pago_google'. Isso evita dupla contagem no card de ROI, porque muitos
  // leads do Google chegam com "adId" preenchido (na verdade o ID da campanha
  // do Google) e seriam creditados também na frente Meta. O padrão preserva o
  // comportamento original (sem filtro de canal) para os demais cards.
  const channelFilterLead = opts?.excludeGoogleOrigin
    ? Prisma.sql`AND "channel" <> 'pago_google'`
    : Prisma.empty
  const channelFilterSale = opts?.excludeGoogleOrigin
    ? Prisma.sql`AND l."channel" <> 'pago_google'`
    : Prisma.empty

  // 1) Agrupa leads de anúncio por adId
  const agg: LeadAgg[] = await prisma.$queryRaw`
    SELECT "adId",
           MAX("adTitle")      AS "adTitle",
           MAX("campaignName") AS "campaignName",
           MAX("adUrl")        AS "adUrl",
           COUNT(*)::int       AS "leads",
           COUNT(*) FILTER (WHERE "status" = 'QUALIFICADO')::int AS "qualificados"
    FROM "Lead"
    WHERE "createdAt" >= ${fromDate}
      AND "createdAt" <= ${toDate}
      AND "adId" IS NOT NULL
      AND "adId" <> ''
      AND "isNewConversation" = true
      AND "isAluno" = false
      ${channelFilterLead}
    GROUP BY "adId"
    ORDER BY "leads" DESC
  `

  // 2) Conta vendas (matrículas) atribuídas a cada anúncio, pelo MÊS DA MATRÍCULA
  //    (s."dataMatricula") dentro do período — e não pela data de chegada do lead.
  //    Assim a venda é creditada ao anúncio do lead casado SEMPRE que houver
  //    correspondência, mesmo com defasagem de mais de um mês entre o lead e a
  //    matrícula (vale para Meta e Google). Cruza Sale -> Lead pelo leadId
  //    (vínculo resolvido na importação de vendas). Exclui as mídias bloqueadas
  //    (ex.: LPSP). Traz também os metadados do anúncio para que vendas de
  //    anúncios sem leads no período ainda consigam exibir nome/campanha.
  const excludedUpper = EXCLUDED_MIDIA.map((m) => m.toUpperCase())
  const salesAgg: {
    adId: string
    vendas: number
    receita: number
    adTitle: string | null
    campaignName: string | null
    adUrl: string | null
  }[] = await prisma.$queryRaw`
    SELECT l."adId" AS "adId",
           COUNT(*)::int AS "vendas",
           COALESCE(SUM(s."valorPago"), 0)::float8 AS "receita",
           MAX(l."adTitle")      AS "adTitle",
           MAX(l."campaignName") AS "campaignName",
           MAX(l."adUrl")        AS "adUrl"
    FROM "Sale" s
    JOIN "Lead" l ON s."leadId" = l."id"
    WHERE s."dataMatricula" >= ${fromDate}
      AND s."dataMatricula" <= ${toDate}
      AND l."adId" IS NOT NULL
      AND l."adId" <> ''
      AND l."isNewConversation" = true
      AND l."isAluno" = false
      ${channelFilterSale}
      AND (s."midia" IS NULL OR UPPER(TRIM(s."midia")) NOT IN (${Prisma.join(excludedUpper)}))
    GROUP BY l."adId"
  `
  const vendasByAd: Record<string, number> = {}
  const receitaByAd: Record<string, number> = {}
  const salesMetaByAd: Record<string, { adTitle: string | null; campaignName: string | null; adUrl: string | null }> = {}
  for (const s of salesAgg) {
    vendasByAd[s.adId] = s.vendas
    receitaByAd[s.adId] = s.receita
    salesMetaByAd[s.adId] = { adTitle: s.adTitle, campaignName: s.campaignName, adUrl: s.adUrl }
  }

  // 3) Busca nome real + gasto na Meta
  const insights = await fetchAdInsights(dateFromStr, dateToStr)
  const metaConfigured = Object.keys(insights).length > 0

  // 3b) Aplica o MESMO recorte de campanhas do painel antigo (funil): considera
  //     apenas anúncios das campanhas selecionadas pelo usuário (monitored_campaigns)
  //     ou, sem seleção, exclui as campanhas que não são de lead no WhatsApp.
  //     Anúncios sem insight da Meta (campanha desconhecida, gasto 0) são mantidos:
  //     não impactam o investimento e caem em "dados insuficientes".
  const monitoredIds = await getMonitoredCampaignIds()

  // 4) Monta as linhas finais pela UNIÃO dos anúncios com leads no período (agg)
  //    e dos anúncios que receberam vendas no período por data de matrícula
  //    (salesAgg). Assim, um anúncio cuja venda chegou com defasagem (0 leads no
  //    período) ainda aparece, com leads=0 e as vendas creditadas.
  const aggByAd: Record<string, LeadAgg> = {}
  for (const a of agg) aggByAd[a.adId] = a

  const allAdIds = Array.from(
    new Set<string>([...agg.map((a) => a.adId), ...salesAgg.map((s) => s.adId)]),
  )

  const rows: AdPerformanceRow[] = allAdIds
    .filter((adId) => {
      const meta = insights[adId]
      if (!meta) return true // sem gasto Meta atribuído: não afeta o investimento
      return isCampaignIncluded(meta.campaignId, meta.campaignName, monitoredIds)
    })
    .map((adId) => {
      const a = aggByAd[adId]
      const sMeta = salesMetaByAd[adId]
      const meta = insights[adId]
      const adName = meta?.name || a?.adTitle || sMeta?.adTitle || `Anúncio ${adId}`
      const campaignName = meta?.campaignName || a?.campaignName || sMeta?.campaignName || ''
      const spend = meta?.spend ?? 0
      const leads = a?.leads ?? 0
      return {
        adId,
        adName,
        campaignName,
        leads,
        qualificados: a?.qualificados ?? 0,
        vendas: vendasByAd[adId] ?? 0,
        receita: receitaByAd[adId] ?? 0,
        spend,
        costPerLead: leads > 0 ? spend / leads : 0,
        adUrl: a?.adUrl ?? sMeta?.adUrl ?? null,
      }
    })
    .sort((x, y) => y.leads - x.leads || y.vendas - x.vendas)

  return { rows, metaConfigured }
}

/**
 * Retorna o investimento total combinado (Meta + Google Ads) no período,
 * e flags indicando quais plataformas estão configuradas.
 */
export async function getCombinedAdSpend(
  fromDate: Date,
  toDate: Date,
  dateFromStr: string,
  dateToStr: string,
): Promise<{
  metaSpend: number
  googleSpend: number
  totalSpend: number
  metaConfigured: boolean
  googleConfigured: boolean
  googleCampaigns: GoogleAdsCampaignSpend[]
}> {
  // Meta
  let metaSpend = 0
  let metaConfigured = false
  try {
    const { rows, metaConfigured: mc } = await getAdPerformance(fromDate, toDate, dateFromStr, dateToStr)
    metaConfigured = mc
    metaSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0)
  } catch (e: any) {
    console.error('[COMBINED_SPEND] erro Meta:', e?.message)
  }

  // Google Ads
  let googleSpend = 0
  let googleCampaigns: GoogleAdsCampaignSpend[] = []
  const googleConfigured = isGoogleAdsConfigured()
  if (googleConfigured) {
    try {
      const gResult = await getGoogleAdsSpend(dateFromStr, dateToStr)
      googleSpend = gResult.totalSpend
      googleCampaigns = gResult.campaigns
    } catch (e: any) {
      console.error('[COMBINED_SPEND] erro Google Ads:', e?.message)
    }
  }

  return {
    metaSpend,
    googleSpend,
    totalSpend: metaSpend + googleSpend,
    metaConfigured,
    googleConfigured,
    googleCampaigns,
  }
}
