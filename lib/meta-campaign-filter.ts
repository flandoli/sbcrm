import { prisma } from '@/lib/prisma'

// Campanhas que NÃO direcionam para o WhatsApp acompanhado (varejo) e devem
// ser excluídas quando o usuário ainda não selecionou campanhas específicas.
// Correspondência por substring normalizada (sem acentos, minúsculas) para
// tolerar emojis/espaços/sufixos.
export const EXCLUDED_CAMPAIGN_MATCHERS = [
  'trafego blog',
  'parceiros - leads',
  'campanha landing pages',
]

export function normalizeCampaignName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function isExcludedCampaign(name: string): boolean {
  const n = normalizeCampaignName(name)
  return EXCLUDED_CAMPAIGN_MATCHERS.some((m) => n.includes(m))
}

/**
 * Lê as campanhas monitoradas (selecionadas pelo usuário) da tabela de settings.
 * Retorna a lista de IDs (string). Vazio = sem seleção (usa exclusão padrão).
 */
export async function getMonitoredCampaignIds(): Promise<string[]> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'monitored_campaigns' } })
    if (setting?.value) {
      const parsed = JSON.parse(setting.value)
      if (Array.isArray(parsed)) return parsed.map((x: any) => String(x))
    }
  } catch {}
  return []
}

/**
 * Decide se uma campanha entra na análise, usando o MESMO critério do painel
 * antigo (funil):
 *  - Se o usuário selecionou campanhas específicas -> apenas essas (por ID).
 *  - Caso contrário -> todas menos as da lista de exclusão padrão (por nome).
 */
export function isCampaignIncluded(
  campaignId: string | null | undefined,
  campaignName: string | null | undefined,
  monitoredIds: string[],
): boolean {
  if (monitoredIds.length > 0) {
    return campaignId != null && monitoredIds.includes(String(campaignId))
  }
  return !isExcludedCampaign(campaignName || '')
}
