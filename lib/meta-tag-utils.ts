/**
 * Deteccao de leads "Meta sem etiqueta".
 *
 * Contexto: todo dia existe uma diferenca entre o numero de conversas que a
 * Meta reporta e o numero de leads que a OpaSuite marca como origem Meta.
 * Parte dessa diferenca acontece porque a Opa nem sempre aplica a etiqueta
 * "Meta" no atendimento, mesmo quando o clique veio de um anuncio
 * Click-to-WhatsApp.
 *
 * Como identificamos: quando o lead chega de um anuncio, a Meta envia o bloco
 * de referral (id do anuncio, titulo e link), que a Opa repassa em
 * `origem.dados`. Guardamos isso em adId / adTitle / adUrl. Ja a etiqueta
 * "Meta" da Opa e guardada separadamente em `metaTagged`.
 *
 * Portanto:
 *   evidencia de anuncio presente + metaTagged = false  ->  Meta sem etiqueta
 *
 * `metaTagCheckedAt` indica que o lead passou pela verificacao de etiqueta
 * (leads anteriores a essa funcionalidade ficam com null e NAO sao marcados,
 * porque nao ha como saber se a etiqueta existia).
 */

export interface MetaTagFields {
  adId?: string | null
  adTitle?: string | null
  adUrl?: string | null
  metaTagged?: boolean | null
  metaTagCheckedAt?: string | Date | null
  source?: string | null
}

/**
 * Ha evidencia tecnica de que o lead veio de um anuncio (referral da Meta).
 * Usa apenas adId como criterio — adUrl e adTitle sao preenchidos com dados
 * genericos (ex: pageUrl) nos leads da Leadster e geram falsos positivos.
 */
export function hasAdEvidence(lead: MetaTagFields): boolean {
  return !!(lead?.adId && lead.adId !== '')
}

/**
 * Lead gerado por anuncio da Meta que a OpaSuite NAO reportou como Meta
 * (etiqueta ausente). Restrito a leads de origem OpaSuite (Click-to-WhatsApp),
 * onde a discrepancia com a Meta realmente existe.
 */
export function isUntaggedMeta(lead: MetaTagFields): boolean {
  if (lead?.source !== 'opasuite') return false
  if (!lead?.metaTagCheckedAt) return false
  if (lead?.metaTagged) return false
  return hasAdEvidence(lead)
}

/**
 * Fragmento de filtro Prisma equivalente ao `isUntaggedMeta`, para contagens
 * e para o filtro da lista de leads.
 */
export function untaggedMetaWhere(): any {
  return {
    source: 'opasuite',
    metaTagged: false,
    metaTagCheckedAt: { not: null },
    adId: { gt: '' },
  }
}
