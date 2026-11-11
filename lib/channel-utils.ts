/**
 * Classifica o canal de aquisição do lead com base nos UTMs.
 *
 * Retorna:
 *  - "pago_meta"    – Facebook / Instagram / Meta Ads
 *  - "pago_google"  – Google Ads
 *  - "pago_outro"   – Outra mídia paga não-Meta/Google
 *  - "organico"     – Busca orgânica ou referência
 *  - "direto"       – Acesso direto (sem UTMs)
 */
export function classifyChannel(
  utmSource?: string | null,
  utmMedium?: string | null,
  hasFbclid?: boolean,
  hasAdData?: boolean,
  hasGclid?: boolean,
): string {
  const src = (utmSource ?? '').toLowerCase().trim()
  const med = (utmMedium ?? '').toLowerCase().trim()

  const isPaid = ['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'cpm', 'cpv', 'display', 'retargeting', 'remarketing'].some(
    (k) => med.includes(k),
  )

  const isMeta = ['facebook', 'fb', 'instagram', 'ig', 'meta'].some((k) => src.includes(k))
  const isGoogle = ['google', 'gads', 'adwords'].some((k) => src.includes(k))

  // Se tem medium indicando pago
  if (isPaid) {
    if (isMeta) return 'pago_meta'
    if (isGoogle) return 'pago_google'
    return 'pago_outro'
  }

  // Se tem gclid/gbraid/wbraid (clique de anúncio Google) mesmo sem UTMs padronizados
  if (hasGclid) return 'pago_google'

  // Se tem fbclid (clique de anúncio Meta) mesmo sem UTMs padronizados
  if (hasFbclid) return 'pago_meta'

  // Se veio de anúncio WhatsApp do OpaSuite (sem UTMs)
  if (hasAdData && !src) return 'pago_meta'

  // Se tem source mas medium não é pago → orgânico / referência
  if (src) {
    if (med === 'organic' || med === 'organico') return 'organico'
    // Tem alguma source identificada (ex: referral, social) → orgânico/referência
    return 'organico'
  }

  // Sem nenhum dado de origem → acesso direto
  return 'direto'
}

/** Label legível para exibição no dashboard */
export function channelLabel(channel: string | null | undefined): string {
  switch (channel) {
    case 'pago_meta': return 'Meta Ads'
    case 'pago_google': return 'Google Ads'
    case 'pago_outro': return 'Mídia Paga'
    case 'organico': return 'Orgânico'
    case 'direto': return 'Direto'
    case 'http': return 'Site'
    default: return '—'
  }
}

/** Cor/estilo do badge por canal */
export function channelColor(channel: string | null | undefined): { text: string; bg: string } {
  switch (channel) {
    case 'pago_meta': return { text: 'text-blue-400', bg: 'bg-blue-400/10' }
    case 'pago_google': return { text: 'text-amber-400', bg: 'bg-amber-400/10' }
    case 'pago_outro': return { text: 'text-purple-400', bg: 'bg-purple-400/10' }
    case 'organico': return { text: 'text-green-400', bg: 'bg-green-400/10' }
    case 'direto': return { text: 'text-gray-400', bg: 'bg-gray-400/10' }
    case 'http': return { text: 'text-cyan-400', bg: 'bg-cyan-400/10' }
    default: return { text: 'text-gray-500', bg: 'bg-gray-500/10' }
  }
}
