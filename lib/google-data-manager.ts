/**
 * Google Data Manager API — upload de conversões offline (enhanced conversions)
 * Endpoint: POST https://datamanager.googleapis.com/v1/events:ingest
 * Escopo OAuth: https://www.googleapis.com/auth/datamanager
 * Usa GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET (mesmo app OAuth)
 * + GOOGLE_DM_REFRESH_TOKEN (escopo datamanager, separado do adwords)
 *
 * Enhanced conversions: além do gclid, envia telefone e e-mail hasheados (SHA-256)
 * para que o Google case a conversão mesmo sem gclid.
 * Telefone: formato E.164 (+5511999999999) → SHA-256 hex
 * E-mail: lowercase, trim → SHA-256 hex
 */

import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'
import { excludedMidiaWhere } from '@/lib/sales-utils'

// ── Config ──────────────────────────────────────────────────────────────
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
const DM_REFRESH_TOKEN = process.env.GOOGLE_DM_REFRESH_TOKEN ?? ''
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID ?? ''
const CONV_ACTION_ID = process.env.GOOGLE_ADS_OFFLINE_CONV_ACTION_ID ?? ''

const DM_ENDPOINT = 'https://datamanager.googleapis.com/v1/events:ingest'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DM_SCOPE = 'https://www.googleapis.com/auth/datamanager'

// ── Cache de access token ───────────────────────────────────────────────
let cachedToken = { value: '', expiresAt: 0 }

export function isDataManagerConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && DM_REFRESH_TOKEN && CUSTOMER_ID && CONV_ACTION_ID)
}

async function getAccessToken(): Promise<string> {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: DM_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OAuth token error (${res.status}): ${text}`)
  }
  const data = await res.json()
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

// ── Hashing helpers ─────────────────────────────────────────────────────

/** SHA-256 hex digest */
function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Normaliza telefone para E.164 (+55...) e retorna SHA-256 hex.
 * Aceita: "5511999999999", "11999999999", "+5511999999999", etc.
 * Retorna null se não conseguir normalizar.
 */
function hashPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null

  let e164: string
  if (digits.startsWith('55') && digits.length >= 12) {
    e164 = '+' + digits
  } else if (digits.length === 10 || digits.length === 11) {
    // Assume Brasil
    e164 = '+55' + digits
  } else {
    // Internacional ou formato desconhecido — tenta usar como está
    e164 = '+' + digits
  }
  return sha256hex(e164)
}

/**
 * Normaliza e-mail (lowercase, trim, regras Gmail) e retorna SHA-256 hex.
 * Retorna null se inválido.
 */
function hashEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  let email = raw.trim().toLowerCase()
  if (!email.includes('@')) return null

  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return null

  // Gmail/Googlemail: remove dots e tudo após + no local-part
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    let cleaned = localPart.replace(/\./g, '')
    const plusIdx = cleaned.indexOf('+')
    if (plusIdx >= 0) cleaned = cleaned.slice(0, plusIdx)
    email = cleaned + '@' + domain
  }

  return sha256hex(email)
}

// ── Tipos ───────────────────────────────────────────────────────────────
export interface UploadResult {
  total: number
  sent: number
  errors: number
  skippedHttp: number
  skippedAlreadySent: number
  skippedNoIdentifier: number // sem gclid E sem telefone/email
  withGclid: number           // quantas tinham gclid
  withPhoneOnly: number       // quantas usaram só telefone/email (sem gclid)
  details: Array<{ saleId: string; matricula: string; success: boolean; error?: string }>
}

// ── Upload de conversões ────────────────────────────────────────────────

/**
 * Envia conversões offline para o Google via Data Manager API.
 * Enhanced conversions: usa gclid + telefone/email hasheado.
 * Vendas sem gclid são enviadas apenas com telefone/email (enhanced match).
 * Exclui: formaContato=HTTP (já rastreado por GTM), sem nenhum identificador.
 */
export async function uploadOfflineConversions(
  saleIds?: string[]
): Promise<UploadResult> {
  const result: UploadResult = {
    total: 0, sent: 0, errors: 0,
    skippedHttp: 0, skippedAlreadySent: 0, skippedNoIdentifier: 0,
    withGclid: 0, withPhoneOnly: 0,
    details: [],
  }

  if (!isDataManagerConfigured()) {
    throw new Error('Data Manager API não configurada. Verifique as variáveis de ambiente.')
  }

  // Buscar vendas casadas, não enviadas ainda (já não exige gclid)
  const where: any = {
    matched: true,
    offlineConvSent: false,
  }
  if (saleIds && saleIds.length > 0) {
    where.id = { in: saleIds }
  }
  // Não enviar conversões de mídias excluídas (ex.: LPSP).
  where.AND = [excludedMidiaWhere]

  const sales = await prisma.sale.findMany({
    where,
    include: {
      lead: {
        select: { gclid: true, channel: true, phoneNormalized: true },
      },
    },
    take: 2000,
  })

  // Filtrar e montar eventos
  interface EligibleEntry {
    sale: typeof sales[0]
    event: Record<string, any>
  }
  const eligible: EligibleEntry[] = []

  for (const sale of sales) {
    result.total++

    if (sale.offlineConvSent) {
      result.skippedAlreadySent++
      continue
    }

    // Excluir HTTP (site — já rastreado pelo GTM)
    if (sale.formaContato && sale.formaContato.toUpperCase() === 'HTTP') {
      result.skippedHttp++
      continue
    }

    const gclid = sale.lead?.gclid ?? null
    // Telefone: da venda (phoneNormalized) ou do lead
    const phone = sale.phoneNormalized || sale.lead?.phoneNormalized || null
    const email = sale.email || null

    const hashedPhone = hashPhone(phone)
    const hashedEmail = hashEmail(email)

    // Precisa de pelo menos um identificador
    if (!gclid && !hashedPhone && !hashedEmail) {
      result.skippedNoIdentifier++
      continue
    }

    // Montar evento
    const dt = sale.dataMatricula ?? sale.createdAt
    const event: Record<string, any> = {
      eventName: 'purchase',
      eventSource: 'PHONE',
      transactionId: sale.matricula, // dedup
      eventTimestamp: dt.toISOString(),
      conversionValue: sale.valorPago ?? 0,
      currency: 'BRL',
    }

    // adIdentifiers (gclid se disponível)
    if (gclid) {
      event.adIdentifiers = { gclid }
      result.withGclid++
    }

    // userData.userIdentifiers (telefone e/ou email hasheado)
    const userIdentifiers: Array<Record<string, any>> = []
    if (hashedPhone) {
      userIdentifiers.push({ phoneNumber: hashedPhone })
    }
    if (hashedEmail) {
      userIdentifiers.push({ emailAddress: hashedEmail })
    }
    if (userIdentifiers.length > 0) {
      event.userData = {
        userIdentifiers,
      }
      if (!gclid) result.withPhoneOnly++
    }

    eligible.push({ sale, event })
  }

  if (eligible.length === 0) {
    return result
  }

  // Enviar em batches de 200
  const BATCH_SIZE = 200
  const token = await getAccessToken()

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batchEntries = eligible.slice(i, i + BATCH_SIZE)
    const batchEvents = batchEntries.map(e => e.event)

    const payload = {
      destinations: [
        {
          operatingAccount: {
            accountType: 'GOOGLE_ADS',
            accountId: CUSTOMER_ID,
          },
          productDestinationId: CONV_ACTION_ID,
        },
      ],
      events: batchEvents,
      encoding: 'HEX',
      consent: {
        adUserData: 'CONSENT_GRANTED',
        adPersonalization: 'CONSENT_GRANTED',
      },
      validateOnly: false,
    }

    try {
      const res = await fetch(DM_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const body = await res.text()

      if (res.ok) {
        const ids = batchEntries.map(b => b.sale.id)
        await prisma.sale.updateMany({
          where: { id: { in: ids } },
          data: {
            offlineConvSent: true,
            offlineConvSentAt: new Date(),
            offlineConvError: null,
          },
        })
        result.sent += batchEvents.length
        for (const b of batchEntries) {
          result.details.push({ saleId: b.sale.id, matricula: b.sale.matricula, success: true })
        }
      } else {
        const errorMsg = `HTTP ${res.status}: ${body.slice(0, 500)}`
        console.error('[DATA_MANAGER] Erro no batch:', errorMsg)

        const ids = batchEntries.map(b => b.sale.id)
        await prisma.sale.updateMany({
          where: { id: { in: ids } },
          data: {
            offlineConvError: errorMsg.slice(0, 500),
          },
        })
        result.errors += batchEvents.length
        for (const b of batchEntries) {
          result.details.push({ saleId: b.sale.id, matricula: b.sale.matricula, success: false, error: errorMsg.slice(0, 200) })
        }
      }
    } catch (err: any) {
      const errorMsg = err?.message ?? 'Erro desconhecido'
      console.error('[DATA_MANAGER] Exceção no batch:', errorMsg)
      result.errors += batchEvents.length
      for (const b of batchEntries) {
        result.details.push({ saleId: b.sale.id, matricula: b.sale.matricula, success: false, error: errorMsg.slice(0, 200) })
      }
    }
  }

  return result
}

/**
 * Testa a conexão com a Data Manager API (valida token + endpoint).
 */
export async function testDataManagerConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isDataManagerConfigured()) {
    return { ok: false, error: 'Variáveis de ambiente não configuradas' }
  }
  try {
    const token = await getAccessToken()
    // Faz uma chamada validateOnly para testar sem enviar dados reais
    const payload = {
      destinations: [
        {
          operatingAccount: {
            accountType: 'GOOGLE_ADS',
            accountId: CUSTOMER_ID,
          },
          productDestinationId: CONV_ACTION_ID,
        },
      ],
      events: [
        {
          transactionId: 'test-connection-001',
          eventTimestamp: new Date().toISOString(),
          conversionValue: 0.01,
          currency: 'BRL',
          adIdentifiers: { gclid: 'test-gclid-000' },
        },
      ],
      validateOnly: true,
    }
    const res = await fetch(DM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await res.text()
    if (res.ok) {
      return { ok: true }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `Autenticação falhou (${res.status}): verifique o refresh token com escopo datamanager` }
    }
    if (res.status === 404) {
      return { ok: false, error: 'Data Manager API não encontrada (404). Habilite-a no Google Cloud Console.' }
    }
    // 400 com gclid inválido é esperado — conexão OK
    if (res.status === 400 && body.includes('CLICK_NOT_FOUND')) {
      return { ok: true }
    }
    return { ok: true } // Qualquer resposta que não seja auth/404 = conexão funciona
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erro desconhecido' }
  }
}
