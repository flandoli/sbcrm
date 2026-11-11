import https from 'https'
import { prisma } from '@/lib/prisma'

// Estado de espera da conversa na OpaSuite.
// A Opa só expõe 3 status (AG = aguardando atendente, EA = em atendimento,
// F = finalizado). "Aguardando cliente" x "Aguardando atendente" dentro de EA
// é definido por quem enviou a última mensagem visível:
//   tipoDestinatario "usuarios"        → mensagem do CLIENTE → aguarda atendente
//   tipoDestinatario "clientes_users"  → mensagem da EMPRESA → aguarda cliente
// Mensagens com visivelParaContato=false (protocolo, direcionamento) são ignoradas.

export type WaitingOn = 'atendente' | 'cliente'

export interface WaitState {
  opaStatus: string | null
  waitingOn: WaitingOn | null
  lastMessageAt: Date | null
  closedAt: Date | null
  assumedAt?: Date | null
  botStuck: boolean
  botStuckStage: string | null // 'optin' | 'welcome'
  botStuckClientMsgs: number | null
}

const CACHE_MS = 2 * 60 * 1000
// Tempo mínimo sem resposta do cliente para considerar o lead "parado no robô".
const STUCK_MIN_AGE_MS = 60 * 60 * 1000 // 1 hora

// A API da Opa usa GET com corpo JSON (filtro), o que o fetch não permite.
function opaGet(path: string, body: any): Promise<any | null> {
  const base = process.env.OPASUITE_API_URL
  const token = process.env.OPASUITE_API_TOKEN
  if (!base || !token) return Promise.resolve(null)
  return new Promise((resolve) => {
    const u = new URL(base + path)
    const data = JSON.stringify(body)
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 10000,
      },
      (res) => {
        let t = ''
        res.on('data', (c) => (t += c))
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) return resolve(null)
          try { resolve(JSON.parse(t)) } catch { resolve(null) }
        })
      },
    )
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
    req.write(data)
    req.end()
  })
}

async function findAtendimento(conversationId: string): Promise<any | null> {
  const isObjectId = /^[a-f0-9]{24}$/i.test(conversationId)
  const filter = isObjectId ? { _id: conversationId } : { protocolo: conversationId }
  const r = await opaGet('/atendimento', { filter, options: { limit: 1 } })
  return Array.isArray(r?.data) && r.data[0] ? r.data[0] : null
}

export async function fetchWaitState(conversationId: string): Promise<WaitState | null> {
  const at = await findAtendimento(conversationId)
  if (!at) return null
  const status: string | null = at.status ?? null
  const closedAt = at.fim ? new Date(at.fim) : null
  if (status === 'F') return { opaStatus: 'F', waitingOn: null, lastMessageAt: null, closedAt, botStuck: false, botStuckStage: null, botStuckClientMsgs: null }

  let lastMessageAt: Date | null = null
  let lastFromClient: boolean | null = null
  let clientMsgCount = 0
  const r = await opaGet('/atendimento/mensagem', { filter: { id_rota: at._id }, options: { limit: 1000 } })
  const msgs: any[] = Array.isArray(r?.data) ? r.data : []
  for (const m of msgs) {
    if (m?.visivelParaContato === false) continue
    const t = m?.data ? new Date(m.data) : null
    if (!t || isNaN(t.getTime())) continue
    const fromClient = m.tipoDestinatario === 'usuarios'
    if (fromClient) clientMsgCount++
    if (!lastMessageAt || t >= lastMessageAt) {
      lastMessageAt = t
      lastFromClient = fromClient
    }
  }

  let waitingOn: WaitingOn | null
  if (status === 'AG') waitingOn = 'atendente' // na fila: ninguém assumiu ainda
  else if (lastFromClient === null) waitingOn = null
  else waitingOn = lastFromClient ? 'atendente' : 'cliente'

  // Parado no robô: conversa aberta, aguardando o cliente (última msg foi da empresa/bot),
  // o cliente quase não respondeu (0-1 mensagens) e já faz mais de 1h sem resposta.
  // Os textos dos portões do bot (opt-in / boas-vindas) NÃO ficam disponíveis nesta API,
  // então a etapa é inferida pelo engajamento: 0 msgs = opt-in, 1 msg = boas-vindas.
  let botStuck = false
  let botStuckStage: string | null = null
  let botStuckClientMsgs: number | null = null
  if (status !== 'AG' && waitingOn === 'cliente' && clientMsgCount <= 1) {
    const age = lastMessageAt ? Date.now() - lastMessageAt.getTime() : 0
    if (age >= STUCK_MIN_AGE_MS) {
      botStuck = true
      botStuckStage = clientMsgCount === 0 ? 'optin' : 'welcome'
      botStuckClientMsgs = clientMsgCount
    }
  }

  return { opaStatus: status, waitingOn, lastMessageAt, closedAt, botStuck, botStuckStage, botStuckClientMsgs }
}

export interface AssumeState {
  opaStatus: string | null
  attendantId: string | null
  assumed: boolean // status != AG e tem atendente atribuído
  closedAt: Date | null
}

// Consulta leve (1 chamada) para saber se o atendimento foi assumido por um atendente,
// mesmo quando o evento de assunção não chegou pelo webhook (assumedAt nulo no banco).
export async function fetchAssumeState(conversationId: string): Promise<AssumeState | null> {
  const at = await findAtendimento(conversationId)
  if (!at) return null
  const status: string | null = at.status ?? null
  const attendantId: string | null = at.id_atendente ?? null
  const closedAt = at.fim ? new Date(at.fim) : null
  // Na OpaSuite, AG = ainda na fila (ninguém assumiu). EA/F com atendente = foi assumido.
  const assumed = status !== 'AG' && !!attendantId
  return { opaStatus: status, attendantId, assumed, closedAt }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

export interface LeadWaitInfo {
  id: string
  opaStatus: string | null
  waitingOn: string | null
  lastMessageAt: string | null
  closedAt: string | null
  botStuck: boolean
  botStuckStage: string | null
  botStuckClientMsgs: number | null
}

// Atualiza (com cache de 2 min) o estado de espera dos leads em aberto.
export async function refreshLeadWaitStates(ids: string[], force = false): Promise<LeadWaitInfo[]> {
  const leads = await prisma.lead.findMany({
    where: { id: { in: ids.slice(0, 60) } },
    select: {
      id: true, opasuiteConversationId: true, closedAt: true, opaStatus: true,
      waitingOn: true, lastMessageAt: true, opaStatusCheckedAt: true,
      botStuck: true, botStuckStage: true, botStuckClientMsgs: true,
    },
  })
  const now = Date.now()
  const results = await mapLimit(leads, 5, async (l) => {
    const fresh = !force && l.opaStatusCheckedAt && now - l.opaStatusCheckedAt.getTime() < CACHE_MS
    if (l.closedAt || !l.opasuiteConversationId || fresh) return l
    const st = await fetchWaitState(l.opasuiteConversationId)
    if (!st) return l
    const updated = await prisma.lead.update({
      where: { id: l.id },
      data: {
        opaStatus: st.opaStatus,
        waitingOn: st.waitingOn,
        lastMessageAt: st.lastMessageAt,
        opaStatusCheckedAt: new Date(),
        botStuck: st.botStuck,
        botStuckStage: st.botStuckStage,
        botStuckClientMsgs: st.botStuckClientMsgs,
        ...(st.opaStatus === 'F' && st.closedAt && !l.closedAt ? { closedAt: st.closedAt } : {}),
      },
      select: { id: true, opasuiteConversationId: true, closedAt: true, opaStatus: true, waitingOn: true, lastMessageAt: true, opaStatusCheckedAt: true, botStuck: true, botStuckStage: true, botStuckClientMsgs: true },
    })
    return updated
  })
  return results.map((l) => ({
    id: l.id,
    opaStatus: l.opaStatus,
    waitingOn: l.waitingOn,
    lastMessageAt: l.lastMessageAt ? l.lastMessageAt.toISOString() : null,
    closedAt: l.closedAt ? l.closedAt.toISOString() : null,
    botStuck: (l as any).botStuck ?? false,
    botStuckStage: (l as any).botStuckStage ?? null,
    botStuckClientMsgs: (l as any).botStuckClientMsgs ?? null,
  }))
}
