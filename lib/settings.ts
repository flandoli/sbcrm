import { prisma } from '@/lib/prisma'
import { getDefaultAllowedDdds } from '@/lib/phone-utils'

// Chaves de configuração editáveis no Admin (toda alteração grava AuditLog).
export const SETTING_KEYS = {
  allowedDdds: 'allowed_ddds', // JSON string[] — modo "pré" de qualificação DDD/DDI
  autoQualify: 'auto_qualify', // "true" | "false"
  capiEnabled: 'capi_enabled', // "true" | "false" — modo "posterior" (Meta CAPI). Desligado na v1.
} as const

export const EDITABLE_SETTING_KEYS: string[] = Object.values(SETTING_KEYS)

export async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key } })
  return s?.value ?? null
}

/** CAPI só fica ativo com capi_enabled === "true" (default: desligado). */
export async function isCapiEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.capiEnabled)) === 'true'
}

export async function isAutoQualifyEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.autoQualify)) !== 'false'
}

export async function getAllowedDdds(): Promise<Set<string>> {
  const raw = await getSetting(SETTING_KEYS.allowedDdds)
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) return new Set(arr.map(String))
    } catch {}
  }
  return new Set(getDefaultAllowedDdds())
}
