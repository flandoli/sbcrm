/**
 * Integração com a Google Ads API (REST / Explorer Access).
 * Busca métricas de investimento (spend) para o período, quebrando por campanha.
 *
 * Credenciais via .env:
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_MANAGER_ID (opcional).
 */

const API_VERSION = 'v25'

const DEV_TOKEN     = () => process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
const CLIENT_ID     = () => process.env.GOOGLE_ADS_CLIENT_ID ?? ''
const CLIENT_SECRET = () => process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
const REFRESH_TOKEN = () => process.env.GOOGLE_ADS_REFRESH_TOKEN ?? ''
const CUSTOMER_ID   = () => (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '')
const MANAGER_ID    = () => (process.env.GOOGLE_ADS_MANAGER_ID ?? '').replace(/-/g, '')

/** Verifica se as credenciais mínimas estão configuradas. */
export function isGoogleAdsConfigured(): boolean {
  return Boolean(DEV_TOKEN() && CLIENT_ID() && CLIENT_SECRET() && REFRESH_TOKEN() && CUSTOMER_ID())
}

/** Cache em memória do access token (dura ~1h). */
let cachedToken: { token: string; expiresAt: number } | null = null

/** Troca o refresh token por um access token válido. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID(),
    client_secret: CLIENT_SECRET(),
    refresh_token: REFRESH_TOKEN(),
  })

  const res = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google OAuth token error (${res.status}): ${err}`)
  }

  const json = await res.json()
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return cachedToken.token
}

export interface GoogleAdsCampaignSpend {
  campaignId: string   // ID numérico da campanha
  campaignName: string
  spend: number        // em moeda da conta (BRL)
  clicks: number
  impressions: number
  conversions: number       // conversões atribuídas pelo Google (tags do GTM)
  conversionsValue: number  // valor/receita atribuído pelo Google
}

/**
 * Busca o gasto total e por campanha no Google Ads para o período.
 * dateFrom/dateTo no formato YYYY-MM-DD.
 * Retorna array de campanhas + total de gasto.
 */
export async function getGoogleAdsSpend(
  dateFrom: string,
  dateTo: string,
): Promise<{ campaigns: GoogleAdsCampaignSpend[]; totalSpend: number }> {
  if (!isGoogleAdsConfigured()) {
    return { campaigns: [], totalSpend: 0 }
  }

  const accessToken = await getAccessToken()
  const customerId = CUSTOMER_ID()
  const managerId = MANAGER_ID()

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
      AND campaign.status != 'REMOVED'
  `

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'developer-token': DEV_TOKEN(),
  }
  // login-customer-id: usar managerId se configurado, senão o próprio customerId
  headers['login-customer-id'] = managerId || customerId

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[GOOGLE_ADS] API error (${res.status}):`, errText)
    throw new Error(`Google Ads API error (${res.status})`)
  }

  const json = await res.json()

  // searchStream retorna array de batches [{results: [...]}]
  const campaignMap = new Map<string, GoogleAdsCampaignSpend>()

  const batches = Array.isArray(json) ? json : [json]
  for (const batch of batches) {
    const results = batch.results || []
    for (const row of results) {
      const campId = String(row.campaign?.id ?? '')
      const name = row.campaign?.name ?? 'Sem nome'
      const costMicros = parseInt(row.metrics?.costMicros ?? '0', 10)
      const clicks = parseInt(row.metrics?.clicks ?? '0', 10)
      const impressions = parseInt(row.metrics?.impressions ?? '0', 10)
      const conversions = parseFloat(row.metrics?.conversions ?? '0')
      const conversionsValue = parseFloat(row.metrics?.conversionsValue ?? '0')
      const spend = costMicros / 1_000_000

      const prev = campaignMap.get(name)
      if (prev) {
        prev.spend += spend
        prev.clicks += clicks
        prev.impressions += impressions
        prev.conversions += conversions
        prev.conversionsValue += conversionsValue
      } else {
        campaignMap.set(name, { campaignId: campId, campaignName: name, spend, clicks, impressions, conversions, conversionsValue })
      }
    }
  }

  const campaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend)
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)

  return { campaigns, totalSpend }
}

/**
 * Testa a conexão com a API do Google Ads (busca 1 campanha).
 * Retorna { success, message }.
 */
export async function testGoogleAdsConnection(): Promise<{ success: boolean; message: string }> {
  if (!isGoogleAdsConfigured()) {
    return { success: false, message: 'Credenciais do Google Ads não configuradas no .env.' }
  }

  try {
    const accessToken = await getAccessToken()
    const customerId = CUSTOMER_ID()
    const managerId = MANAGER_ID()

    const query = `SELECT campaign.name FROM campaign LIMIT 1`
    const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'developer-token': DEV_TOKEN(),
    }
    headers['login-customer-id'] = managerId || customerId

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, message: `Erro da API (${res.status}): ${errText.slice(0, 200)}` }
    }

    return { success: true, message: 'Conexão com Google Ads OK — Explorer Access confirmado.' }
  } catch (e: any) {
    return { success: false, message: e?.message ?? 'Erro desconhecido' }
  }
}
