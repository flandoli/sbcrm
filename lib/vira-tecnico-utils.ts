import { prisma } from '@/lib/prisma'

/**
 * Vira Técnico — utilitários de detecção.
 *
 * Um lead é marcado como "Vira Técnico" quando QUALQUER uma das condições abaixo é verdadeira:
 *  1. Slug: o texto normalizado "viratecnico" aparece em algum campo de origem
 *     (URL/título do anúncio, nome/ID da campanha, UTMs, primeira mensagem).
 *  2. Canal OpaSuite: o channelId (canal_id) do atendimento está na lista configurada
 *     em Configurações (identifica a linha de WhatsApp 11 94577-7262).
 *  3. Etiqueta OpaSuite: alguma etiqueta do atendimento está na lista configurada.
 *
 * A detecção é "sticky": uma vez marcado true, permanece true.
 */

export const VIRA_TECNICO_CHANNELS_KEY = 'vira_tecnico_channels'
export const VIRA_TECNICO_TAGS_KEY = 'vira_tecnico_tags'
// Canais (linhas de WhatsApp) que devem marcar o lead como SSRJ.
// Identifica a linha 21 2042-2360 pelo channelId (canal_id) da OpaSuite.
export const SSRJ_CHANNELS_KEY = 'ssrj_channels'

/** Remove acentos, espaços, pontuação e deixa minúsculo. */
export function normalizeSlug(s?: string | null): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Verifica se o slug "viratecnico" aparece em qualquer um dos campos fornecidos. */
export function matchesViraTecnicoText(...fields: (string | null | undefined)[]): boolean {
  for (const f of fields) {
    if (!f) continue
    if (normalizeSlug(f).includes('viratecnico')) return true
  }
  return false
}

/** Faz o parse de uma configuração que pode ser JSON array ou lista separada por vírgula. */
export function parseIdList(value?: string | null): string[] {
  if (!value) return []
  const raw = value.trim()
  if (!raw) return []
  let items: string[] = []
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) items = arr.map((x) => String(x))
    } catch {
      items = []
    }
  }
  if (items.length === 0) {
    items = raw.split(/[,\n;]/).map((x) => x.trim())
  }
  return items.map((x) => x.trim()).filter(Boolean)
}

let _cache: { channels: Set<string>; tags: Set<string>; at: number } | null = null
const CACHE_MS = 5 * 60 * 1000

/** Carrega (com cache de 5min) as listas de channelIds e tagIds configuradas em Configurações. */
export async function getViraTecnicoConfig(): Promise<{ channels: Set<string>; tags: Set<string> }> {
  const now = Date.now()
  if (_cache && now - _cache.at < CACHE_MS) {
    return { channels: _cache.channels, tags: _cache.tags }
  }
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: [VIRA_TECNICO_CHANNELS_KEY, VIRA_TECNICO_TAGS_KEY] } },
    })
    const map = new Map(rows.map((r) => [r.key, r.value]))
    const channels = new Set(parseIdList(map.get(VIRA_TECNICO_CHANNELS_KEY)))
    const tags = new Set(parseIdList(map.get(VIRA_TECNICO_TAGS_KEY)))
    _cache = { channels, tags, at: now }
    return { channels, tags }
  } catch {
    return { channels: new Set(), tags: new Set() }
  }
}

/** Invalida o cache (chamar após salvar configurações). */
export function clearViraTecnicoCache() {
  _cache = null
}

// --- SSRJ por linha de WhatsApp (channelId) ---
let _ssrjCache: { channels: Set<string>; at: number } | null = null

/** Carrega (com cache de 5min) a lista de channelIds configurada como SSRJ. */
export async function getSsrjChannels(): Promise<Set<string>> {
  const now = Date.now()
  if (_ssrjCache && now - _ssrjCache.at < CACHE_MS) return _ssrjCache.channels
  try {
    const row = await prisma.setting.findUnique({ where: { key: SSRJ_CHANNELS_KEY } })
    const channels = new Set(parseIdList(row?.value))
    _ssrjCache = { channels, at: now }
    return channels
  } catch {
    return new Set()
  }
}

/** Invalida o cache de canais SSRJ (chamar após salvar configurações). */
export function clearSsrjChannelsCache() {
  _ssrjCache = null
}

/**
 * Decide se um atendimento OpaSuite é Vira Técnico com base em channelId, etiquetas e textos.
 * `tagIds` deve ser uma lista de IDs de etiqueta (strings).
 */
export async function detectViraTecnicoOpa(params: {
  channelId?: string | null
  tagIds?: (string | null | undefined)[]
  textFields?: (string | null | undefined)[]
}): Promise<boolean> {
  const { channelId, tagIds = [], textFields = [] } = params
  if (matchesViraTecnicoText(...textFields)) return true
  const { channels, tags } = await getViraTecnicoConfig()
  if (channelId && channels.has(String(channelId))) return true
  for (const t of tagIds) {
    if (t && tags.has(String(t))) return true
  }
  return false
}
