import crypto from 'crypto'

// Versão atual da Graph API (Conversions API). Atualizada de v19.0 → v26.0.
const GRAPH_VERSION = 'v26.0'

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function norm(v?: string | null): string {
  return (v ?? '').trim().toLowerCase()
}

/** Hash SHA-256 de um campo de texto (email, nome) após normalizar. */
function hashField(v?: string | null): string | undefined {
  const n = norm(v)
  return n ? sha256(n) : undefined
}

/** Hash SHA-256 do telefone (apenas dígitos, com DDI). */
function hashPhone(v?: string | null): string | undefined {
  const digits = (v ?? '').replace(/\D/g, '')
  return digits ? sha256(digits) : undefined
}

/** Divide o nome completo em primeiro/último nome para os campos fn/ln. */
function splitName(full?: string | null): { fn?: string; ln?: string } {
  const parts = norm(full).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { fn: parts[0] }
  return { fn: parts[0], ln: parts[parts.length - 1] }
}

export interface MetaUserData {
  phone?: string | null
  email?: string | null
  name?: string | null
  /** ID interno (ex.: lead.id) — hasheado e enviado como external_id para ligar os eventos do funil. */
  externalId?: string | null
}

export interface MetaEventResult {
  success: boolean
  eventId: string
  error?: string
  response?: any
}

export interface SendMetaEventOptions {
  eventName: string
  user: MetaUserData
  value?: number | null
  currency?: string
  /** event_id determinístico (dedup). Se ausente, gera um UUID. */
  eventId?: string
  /** Unix time (segundos) do evento. Default: agora. */
  eventTime?: number
  actionSource?: string
  testEventCode?: string
}

/**
 * Envia um evento à Conversions API da Meta (server-side).
 *
 * Eventos server-side de CRM/mensageria SEM o ctwa_clid usam action_source
 * 'system_generated' e dependem do Advanced Matching (telefone/email/nome
 * hasheados em SHA-256) para a Meta casar o evento ao usuário e ao anúncio.
 */
export async function sendMetaEvent(opts: SendMetaEventOptions): Promise<MetaEventResult> {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  const eventId = opts.eventId ?? crypto.randomUUID()

  if (!pixelId || !token) {
    return { success: false, eventId, error: 'META_PIXEL_ID ou META_CAPI_TOKEN não configurados' }
  }

  const { fn, ln } = splitName(opts.user.name)
  const userData: Record<string, any> = {}
  const ph = hashPhone(opts.user.phone)
  if (ph) userData.ph = [ph]
  const em = hashField(opts.user.email)
  if (em) userData.em = [em]
  if (fn) userData.fn = [sha256(fn)]
  if (ln) userData.ln = [sha256(ln)]
  if (opts.user.externalId) userData.external_id = [sha256(String(opts.user.externalId))]

  // A Conversions API da Meta REJEITA eventos com event_time mais antigo que ~7
  // dias (erro subcode 2804003, "event_time muito antigo"). Para o backfill de
  // registros históricos, limitamos (clamp) o timestamp à janela aceita: nunca
  // mais antigo que 6 dias nem no futuro. Eventos ao vivo usam "agora" e não são
  // afetados. Consequência: a atribuição temporal de eventos antigos é aproximada.
  const nowSec = Math.floor(Date.now() / 1000)
  const minSec = nowSec - 6 * 24 * 60 * 60
  let eventTime = opts.eventTime ?? nowSec
  if (eventTime < minSec) eventTime = minSec
  if (eventTime > nowSec) eventTime = nowSec

  const event: Record<string, any> = {
    event_name: opts.eventName,
    event_time: eventTime,
    action_source: opts.actionSource ?? 'system_generated',
    event_id: eventId,
    user_data: userData,
  }

  if (typeof opts.value === 'number' && !isNaN(opts.value)) {
    event.custom_data = { value: Number(opts.value.toFixed(2)), currency: opts.currency ?? 'BRL' }
  }

  const payload: any = { data: [event] }
  const code = opts.testEventCode?.trim()
  if (code) payload.test_event_code = code

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      return { success: false, eventId, error: JSON.stringify(data), response: data }
    }
    return { success: true, eventId, response: data }
  } catch (err: any) {
    return { success: false, eventId, error: err?.message ?? 'Erro de rede' }
  }
}

// ---------------------------------------------------------------------------
// Wrappers do funil (event_id determinístico para dedup entre webhook/backfill)
// ---------------------------------------------------------------------------

/** Evento 'Lead' — lead identificado (medição de topo do funil). */
export async function sendLeadIdentifiedEvent(
  leadId: string,
  user: MetaUserData,
  eventTime?: number,
): Promise<MetaEventResult> {
  return sendMetaEvent({ eventName: 'Lead', user, eventId: `lead-${leadId}`, eventTime })
}

/** Evento 'QualifiedLead' — lead atende aos critérios comerciais (otimizar qualidade). */
export async function sendQualifiedLeadEvent(
  leadId: string,
  user: MetaUserData,
  eventTime?: number,
): Promise<MetaEventResult> {
  return sendMetaEvent({ eventName: 'QualifiedLead', user, eventId: `ql-${leadId}`, eventTime })
}

/** Evento 'Purchase' com value/currency — matrícula confirmada (otimizar vendas/valor). */
export async function sendPurchaseEvent(
  matricula: string,
  user: MetaUserData,
  value: number,
  eventTime?: number,
): Promise<MetaEventResult> {
  return sendMetaEvent({
    eventName: 'Purchase',
    user,
    value,
    currency: 'BRL',
    eventId: `purchase-${matricula}`,
    eventTime,
  })
}

/**
 * Compatibilidade retroativa: antigo helper que mandava um único evento 'Lead'
 * por telefone. Mantido para não quebrar chamadas antigas; agora reaproveitado
 * como o evento de topo 'Lead'. Prefira os wrappers acima.
 */
export async function sendLeadEvent(phoneNormalized: string): Promise<MetaEventResult> {
  return sendMetaEvent({ eventName: 'Lead', user: { phone: phoneNormalized } })
}

export async function testMetaConnection(testEventCode?: string): Promise<{ success: boolean; message: string }> {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN

  if (!pixelId || !token) {
    return { success: false, message: 'Credenciais não configuradas (META_PIXEL_ID / META_CAPI_TOKEN)' }
  }

  // Testamos enviando um evento de teste ao endpoint /events — exatamente a
  // operação que o token da Conversions API precisa realizar.
  const payload: any = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'system_generated',
        event_id: `test-connection-${crypto.randomUUID()}`,
        user_data: {
          ph: [sha256('5511999999999')],
        },
      },
    ],
  }
  const code = testEventCode?.trim()
  if (code) payload.test_event_code = code

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      return { success: false, message: data?.error?.message ?? 'Erro ao conectar' }
    }
    if ((data?.events_received ?? 0) >= 1) {
      const suffix = code
        ? ' (evento de teste — visível na aba "Testar eventos" do Events Manager)'
        : ''
      return { success: true, message: `Conexão OK — Pixel ${pixelId} recebendo eventos${suffix}` }
    }
    return { success: false, message: 'A Meta não confirmou o recebimento do evento' }
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Erro de rede' }
  }
}
