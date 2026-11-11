// Cliente da API da Vai de Vendas (VaiCRM).
//
// Observações validadas contra a API real (api.vaicrm.com.br):
//  - O firewall deles BLOQUEIA (403, code 1010) requisições sem cabeçalhos de
//    navegador. Por isso enviamos User-Agent/Origin/Referer em toda chamada.
//  - Os "tokens de API" (prefixo vai_) só valem para webhooks; os endpoints de
//    dados (/contacts, /call-records) exigem autenticação via LOGIN (JWT).
//  - /contacts e /call-records são paginados ({ data, total, page, limit,
//    totalPages, hasNext }), ordenados do mais recente para o mais antigo.

const BASE = 'https://api.vaicrm.com.br'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Accept: 'application/json',
  Origin: 'https://app.vaicrm.com.br',
  Referer: 'https://app.vaicrm.com.br/',
}

export interface VaiCrmContact {
  id: string
  channel: string | null
  identifier: string | null
  name: string | null
  email: string | null
  phone: string | null
  isGroup?: boolean
  isBlocked?: boolean
  lastMessageAt?: string | null
  createdAt: string
  updatedAt?: string | null
  tags?: Array<{ tag?: { name?: string | null } | null; tagId?: string } | null> | null
  // Dados do anúncio que originou o contato (Click-to-WhatsApp do Meta). Vem
  // preenchido apenas para contatos que chegaram por anúncio; vazio/ausente
  // para os demais. Observado ao vivo: sourceType='ad', ctwaClid (id do clique
  // Click-to-WhatsApp, exclusivo do Meta), sourceId (id do anúncio/criativo),
  // sourceUrl/mediaUrl apontando para instagram.com/fb.me/cdninstagram/fbcdn.
  adReferral?: {
    sourceType?: string | null
    sourceId?: string | null
    sourceUrl?: string | null
    mediaUrl?: string | null
    mediaType?: string | null
    title?: string | null
    body?: string | null
    ctwaClid?: string | null
  } | null
  adReferralAt?: string | null
}

interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext?: boolean
}

// Cache do JWT. Mantemos em memória (por processo) E no banco (compartilhado
// entre TODAS as execuções/abas), para NUNCA logar a cada chamada — a Vai de
// Vendas bloqueia a conta por "tentativas excessivas" de login. Reusamos o mesmo
// token até próximo do vencimento (lido do próprio JWT).
interface TokenEntry { token: string; expMs: number; refreshToken?: string | null }
let cachedToken: TokenEntry | null = null
const TOKEN_CACHE_KEY = 'vaivendas_jwt_cache'
const LOGIN_COOLDOWN_KEY = 'vaivendas_login_cooldown'
const EXP_SKEW_MS = 60 * 1000 // renova 1 min antes de vencer
// Regra do próprio manual da Vai de Vendas: o login é limitado a 5/min e 5 senhas
// erradas BLOQUEIAM a conta. Então, se o login falhar (401/403/429), paramos de
// tentar por um tempo (cooldown) em vez de martelar e travar o usuário.
const LOGIN_COOLDOWN_MS = 30 * 60 * 1000

function getCreds(): { email: string; password: string } {
  const email = process.env.VAICRM_LOGIN_EMAIL
  const password = process.env.VAICRM_LOGIN_PASSWORD
  if (!email || !password) {
    throw new Error('Credenciais da Vai de Vendas ausentes (VAICRM_LOGIN_EMAIL / VAICRM_LOGIN_PASSWORD).')
  }
  return { email, password }
}

/** Lê o vencimento (exp) de dentro do JWT, em ms. Null se não der para decodificar. */
function jwtExpMs(token: string): number | null {
  try {
    const part = token.split('.')[1]
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return typeof json?.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

// Evita import estático (lib usada também fora do runtime do app). Carrega o
// prisma sob demanda para ler/gravar o cache de token no banco.
async function getPrisma(): Promise<any | null> {
  try {
    const mod = await import('@/lib/prisma')
    return (mod as any).prisma ?? null
  } catch {
    return null
  }
}

async function readDbToken(): Promise<TokenEntry | null> {
  const prisma = await getPrisma()
  if (!prisma) return null
  try {
    const row = await prisma.setting.findUnique({ where: { key: TOKEN_CACHE_KEY } })
    if (!row?.value) return null
    const obj = JSON.parse(row.value)
    if (obj?.token && typeof obj.expMs === 'number') return obj
  } catch {}
  return null
}

// --- Trava anti-bloqueio: cooldown de login após falha de autenticação. ---
async function getLoginCooldownUntil(): Promise<number> {
  const prisma = await getPrisma()
  if (!prisma) return 0
  try {
    const row = await prisma.setting.findUnique({ where: { key: LOGIN_COOLDOWN_KEY } })
    const v = row?.value ? Number(row.value) : 0
    return Number.isFinite(v) ? v : 0
  } catch { return 0 }
}

async function setLoginCooldown(untilMs: number): Promise<void> {
  const prisma = await getPrisma()
  if (!prisma) return
  try {
    await prisma.setting.upsert({
      where: { key: LOGIN_COOLDOWN_KEY },
      create: { key: LOGIN_COOLDOWN_KEY, value: String(untilMs) },
      update: { value: String(untilMs) },
    })
  } catch {}
}

/** Limpa a trava de login (ex.: depois que o usuário corrigir a senha). */
export async function clearVaiLoginCooldown(): Promise<void> {
  cachedToken = null
  await setLoginCooldown(0)
}

async function writeDbToken(entry: TokenEntry): Promise<void> {
  const prisma = await getPrisma()
  if (!prisma) return
  try {
    const value = JSON.stringify(entry)
    await prisma.setting.upsert({
      where: { key: TOKEN_CACHE_KEY },
      create: { key: TOKEN_CACHE_KEY, value },
      update: { value },
    })
  } catch {}
}

function extractTokens(json: any): { token: string | null; refreshToken: string | null } {
  const token = json?.access_token ?? json?.accessToken ?? json?.data?.access_token ?? json?.data?.accessToken ?? null
  const refreshToken = json?.refresh_token ?? json?.refreshToken ?? json?.data?.refresh_token ?? json?.data?.refreshToken ?? null
  return { token, refreshToken }
}

async function doRealLogin(): Promise<TokenEntry> {
  const { email, password } = getCreds()
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Falha de login: ativa cooldown para NÃO martelar (evita travar a conta).
    await setLoginCooldown(Date.now() + LOGIN_COOLDOWN_MS)
    throw new Error(`Falha no login da Vai de Vendas (HTTP ${res.status}): ${body.slice(0, 200)}`)
  }
  const { token, refreshToken } = extractTokens(await res.json())
  if (!token) throw new Error('Login da Vai de Vendas não retornou access_token.')
  const expMs = jwtExpMs(token) ?? Date.now() + 55 * 60 * 1000
  const entry: TokenEntry = { token, expMs, refreshToken }
  cachedToken = entry
  await writeDbToken(entry)
  await setLoginCooldown(0) // sucesso: zera qualquer cooldown anterior
  return entry
}

/**
 * Renova o access_token via refresh_token (POST /auth/refresh). O limite é de
 * 60/min (contra 5/min do login), então é o caminho preferido para renovar.
 * Retorna null se não houver refresh_token ou se a renovação falhar.
 */
async function doRefresh(refreshToken: string): Promise<TokenEntry | null> {
  try {
    // Conforme o manual da Vai de Vendas: corpo { refreshToken } em camelCase
    // (com refresh_token a API responde 400), SEM header Authorization.
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const { token, refreshToken: newRefresh } = extractTokens(await res.json())
    if (!token) return null
    const expMs = jwtExpMs(token) ?? Date.now() + 55 * 60 * 1000
    const entry: TokenEntry = { token, expMs, refreshToken: newRefresh ?? refreshToken }
    cachedToken = entry
    await writeDbToken(entry)
    return entry
  } catch {
    return null
  }
}

async function login(force = false): Promise<string> {
  const now = Date.now()
  // 1) cache em memória
  if (!force && cachedToken && now < cachedToken.expMs - EXP_SKEW_MS) return cachedToken.token
  // 2) cache no banco (compartilhado entre execuções)
  const db = await readDbToken()
  if (!force && db && now < db.expMs - EXP_SKEW_MS) {
    cachedToken = db
    return db.token
  }
  // 3) renovação via refresh_token (barato: 60/min) antes de tentar login cheio
  const refreshToken = cachedToken?.refreshToken ?? db?.refreshToken ?? null
  if (refreshToken) {
    const refreshed = await doRefresh(refreshToken)
    if (refreshed) return refreshed.token
  }
  // 4) login de verdade (último recurso) — respeitando o cooldown anti-bloqueio.
  const cooldownUntil = await getLoginCooldownUntil()
  if (now < cooldownUntil) {
    const mins = Math.ceil((cooldownUntil - now) / 60000)
    throw new Error(
      `Login da Vai de Vendas em pausa de segurança por mais ~${mins} min após falha de autenticação. ` +
      `Verifique e-mail/senha (idealmente um usuário dedicado à integração) e tente novamente.`,
    )
  }
  const entry = await doRealLogin()
  return entry.token
}

async function authedGet<T>(path: string): Promise<T> {
  let token = await login()
  let res = await fetch(`${BASE}${path}`, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 401) {
    // JWT rejeitado/vencido — força UMA renovação (refresh ou login) e tenta de novo.
    cachedToken = null
    token = await login(true)
    res = await fetch(`${BASE}${path}`, {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Vai de Vendas GET ${path} falhou (HTTP ${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/**
 * Busca os contatos criados a partir de `since` (inclusive). A API não tem
 * filtro de data, mas devolve os contatos do mais recente para o mais antigo —
 * então paginamos até cruzar a data de corte. `maxPages` limita o trabalho por
 * execução (segurança contra loops/timeout).
 */
export async function fetchContactsSince(
  since: Date,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<VaiCrmContact[]> {
  const pageSize = opts.pageSize ?? 100
  const maxPages = opts.maxPages ?? 50
  const out: VaiCrmContact[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await authedGet<Paginated<VaiCrmContact>>(
      `/contacts?limit=${pageSize}&page=${page}`,
    )
    const batch = res?.data ?? []
    if (batch.length === 0) break
    let crossedCutoff = false
    for (const c of batch) {
      const created = new Date(c.createdAt)
      if (created >= since) out.push(c)
      else crossedCutoff = true
    }
    const hasNext = res.hasNext ?? page < (res.totalPages ?? 1)
    if (crossedCutoff || !hasNext) break
  }
  return out
}

/**
 * Chat (atendimento) na Vai de Vendas. Um contato pode ter 1+ chats; o chat é
 * a unidade de "atendimento": status 'pending' (na fila, ninguém assumiu),
 * 'open' (em atendimento) ou 'closed' (encerrado). `assignedUserId` preenchido
 * indica que um atendente assumiu o chat.
 */
export interface VaiCrmChat {
  id: string
  status: string | null
  assignedUserId?: string | null
  assignedToId?: string | null
  firstResponseAt?: string | null
  closedAt?: string | null
  createdAt: string
  lastActivityAt?: string | null
  contactId: string | null
}

/**
 * Busca os chats (atendimentos) da Vai de Vendas. A base é pequena, então
 * paginamos até `maxPages` para montar o retrato atual dos atendimentos e
 * refletir o status (assumido/na fila/encerrado) nos leads já importados.
 */
export async function fetchChats(
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<VaiCrmChat[]> {
  const pageSize = opts.pageSize ?? 100
  const maxPages = opts.maxPages ?? 30
  const out: VaiCrmChat[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await authedGet<Paginated<any>>(`/chats?limit=${pageSize}&page=${page}`)
    const batch = res?.data ?? []
    if (batch.length === 0) break
    for (const ch of batch) {
      out.push({
        id: ch.id,
        status: ch.status ?? null,
        assignedUserId: ch.assignedUserId ?? null,
        assignedToId: ch.assignedToId ?? null,
        firstResponseAt: ch.firstResponseAt ?? null,
        closedAt: ch.closedAt ?? null,
        createdAt: ch.createdAt,
        lastActivityAt: ch.lastActivityAt ?? null,
        contactId: ch.contactId ?? (ch.contact?.id ?? null),
      })
    }
    const hasNext = res.hasNext ?? page < (res.totalPages ?? 1)
    if (!hasNext) break
  }
  return out
}

/** Nomes das tags de um contato (em minúsculas), para mapeamento de origem. */
export function contactTagNames(c: VaiCrmContact): string[] {
  const tags = c.tags ?? []
  const names: string[] = []
  for (const t of tags) {
    const n = t?.tag?.name
    if (typeof n === 'string' && n.trim()) names.push(n.trim().toLowerCase())
  }
  return names
}

/**
 * Indica se o contato chegou por um ANÚNCIO. No VCRM, o campo `adReferral` só
 * é preenchido para contatos vindos de Click-to-WhatsApp do Meta (o `ctwaClid`
 * é exclusivo do Meta). Consideramos anúncio quando sourceType='ad' ou quando
 * há sinais inequívocos (ctwaClid/sourceId).
 */
export function hasAdReferral(c: VaiCrmContact): boolean {
  const a = c.adReferral
  if (!a || typeof a !== 'object') return false
  return a.sourceType === 'ad' || !!a.ctwaClid || !!a.sourceId
}

/**
 * Canal de MÍDIA derivado do anúncio do VCRM. Todo `adReferral` do VCRM é um
 * Click-to-WhatsApp do Meta (Instagram/Facebook), então retornamos 'pago_meta'.
 * Retorna null quando o contato não veio de anúncio.
 */
export function channelFromAdReferral(c: VaiCrmContact): string | null {
  return hasAdReferral(c) ? 'pago_meta' : null
}

/**
 * Extrai id e título do anúncio a partir do `adReferral`, para exibir na coluna
 * "Anúncio" (consistência com os leads do OpaSuite). Usa o título do anúncio e,
 * na falta dele, o começo do texto (body).
 */
export function adInfoFromReferral(c: VaiCrmContact): { adId: string | null; adTitle: string | null; adUrl: string | null } {
  const a = c.adReferral
  if (!hasAdReferral(c) || !a) return { adId: null, adTitle: null, adUrl: null }
  const raw = (a.title && a.title.trim()) || (a.body && a.body.trim()) || null
  const adTitle = raw && raw.length > 140 ? raw.slice(0, 137) + '...' : raw
  // Link para o anúncio/criativo: prioriza a URL do post (sourceUrl:
  // instagram.com/p/... ou fb.me/...); na falta, usa a mídia (mediaUrl).
  const url = (a.sourceUrl && a.sourceUrl.trim()) || (a.mediaUrl && a.mediaUrl.trim()) || null
  return { adId: a.sourceId ?? null, adTitle, adUrl: url }
}

/** Nomes das tags de um contato preservando o texto original (para exibição). */
export function contactTagNamesRaw(c: VaiCrmContact): string[] {
  const tags = c.tags ?? []
  const names: string[] = []
  for (const t of tags) {
    const n = t?.tag?.name
    if (typeof n === 'string' && n.trim()) names.push(n.trim())
  }
  return names
}

// --- Kanban CRM (funil de vendas da Vai de Vendas) ---------------------------
// O funil fica sob /kanban/*. A pipeline padrão ("Vendas cursos") tem 5 etapas
// com flags isWonStage (ganho/matrícula) e isLostStage (perda). Cada card
// (/kanban/contacts) carrega stage, outcome ('won'|'lost'|null) e salesData.

export interface VaiCrmStage {
  id: string
  name: string
  order: number
  probability?: number | null
  isWonStage?: boolean
  isLostStage?: boolean
  isActive?: boolean
}

export interface VaiCrmPipeline {
  id: string
  name: string
  isDefault?: boolean
  stages: VaiCrmStage[]
}

export interface VaiCrmKanbanContact {
  id: string // = contactId
  name?: string | null
  phone?: string | null
  stageId?: string | null
  stage?: VaiCrmStage | null
  outcome?: string | null // 'won' | 'lost' | null
  outcomeAt?: string | null
  salesData?: { value?: number | null } | null
}

/** Busca a pipeline padrão (etapas do funil Kanban CRM). */
export async function fetchDefaultPipeline(): Promise<VaiCrmPipeline | null> {
  const p = await authedGet<VaiCrmPipeline>('/kanban/pipelines/default')
  if (!p?.id) return null
  return { ...p, stages: Array.isArray(p.stages) ? p.stages : [] }
}

/** Busca os cards do funil Kanban (contato + etapa + desfecho + valor). */
export async function fetchKanbanContacts(
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<VaiCrmKanbanContact[]> {
  const pageSize = opts.pageSize ?? 100
  const maxPages = opts.maxPages ?? 30
  const out: VaiCrmKanbanContact[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await authedGet<Paginated<VaiCrmKanbanContact>>(`/kanban/contacts?limit=${pageSize}&page=${page}`)
    const batch = res?.data ?? []
    if (batch.length === 0) break
    for (const k of batch) out.push(k)
    const hasNext = res.hasNext ?? page < (res.totalPages ?? 1)
    if (!hasNext) break
  }
  return out
}

/**
 * Normaliza o nome (longo) de uma etapa do Kanban para um rótulo curto e estável
 * usado no painel. Usa as flags isWon/isLost e palavras-chave do nome, para não
 * quebrar se o usuário renomear ligeiramente as etapas na Vai de Vendas.
 */
export function normalizeStageLabel(stage?: VaiCrmStage | null): string | null {
  if (!stage) return null
  if (stage.isWonStage) return 'Matrícula'
  if (stage.isLostStage) return 'Perda'
  const n = (stage.name ?? '').trim().toLowerCase()
  if (!n) return null
  if (n.includes('apresenta')) return 'Apresentação'
  if (n.includes('analis')) return 'Analisando'
  if (n.includes('negocia')) return 'Negociação'
  if (n.includes('perda') || n.includes('perdid')) return 'Perda'
  if (n.includes('matr') || n.includes('venda') || n.includes('ganho')) return 'Matrícula'
  return (stage.name ?? '').trim() || null
}
