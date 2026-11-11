const ALLOWED_DDDS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '20','21','22','23','24','25','26','27','28','29',
  '30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49',
])

export interface PhoneParseResult {
  raw: string
  normalized: string | null
  ddi: string | null
  ddd: string | null
  status: 'NOVO' | 'DDD_INDESEJADO' | 'DDI_INDESEJADO'
}

/**
 * Modo "pré" de qualificação. Brasil (55) valida o DDD contra allowedDdds.
 * Números internacionais só passam se o DDI estiver em allowedDdis (casamento pelo prefixo mais longo).
 */
export function parsePhone(raw: string, allowedDdds?: Set<string>, allowedDdis?: Set<string>): PhoneParseResult {
  const digits = (raw ?? '').replace(/\D/g, '')
  const ddds = allowedDdds ?? ALLOWED_DDDS

  if (digits.length < 10) {
    return { raw, normalized: digits || null, ddi: null, ddd: null, status: 'DDI_INDESEJADO' }
  }

  // Check if starts with 55 (Brazil)
  let ddi: string | null = null
  let rest = digits

  if (digits.startsWith('55') && digits.length >= 12) {
    ddi = '55'
    rest = digits.slice(2)
  } else if (digits.length === 10 || digits.length === 11) {
    // Assume Brazil if 10 or 11 digits (DDD + number)
    ddi = '55'
    rest = digits
  } else {
    // Número internacional
    const match = Array.from(allowedDdis ?? [])
      .filter((d) => d !== '55' && digits.startsWith(d))
      .sort((a, b) => b.length - a.length)[0]
    if (match) return { raw, normalized: digits, ddi: match, ddd: null, status: 'NOVO' }
    return { raw, normalized: digits, ddi: digits.slice(0, 2), ddd: null, status: 'DDI_INDESEJADO' }
  }

  const ddd = rest.slice(0, 2)
  const normalized = '55' + rest

  if (!ddds.has(ddd)) {
    return { raw, normalized, ddi, ddd, status: 'DDD_INDESEJADO' }
  }

  return { raw, normalized, ddi, ddd, status: 'NOVO' }
}

export function maskPhone(phone: string | null): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return phone

  let ddd: string
  let number: string

  if (digits.startsWith('55') && digits.length >= 12) {
    ddd = digits.slice(2, 4)
    number = digits.slice(4)
  } else {
    ddd = digits.slice(0, 2)
    number = digits.slice(2)
  }

  const last4 = number.slice(-4)
  const masked = '*'.repeat(Math.max(0, number.length - 4))
  return `(${ddd}) ${masked}-${last4}`
}

export function getDefaultAllowedDdds(): string[] {
  return Array.from(ALLOWED_DDDS).sort()
}
