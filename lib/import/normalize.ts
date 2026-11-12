// Normalização e validação usadas na importação e na troca de CNPJ. Sem dependência de banco.

/** Nome sem acento, minúsculo, só letras/dígitos — chave para casar empresas e pessoas. */
export function normalizeName(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '')

// ---------- CNPJ ----------

/** Raiz reservada aos CNPJs fantasmas: 9999NNNN/0000-00. Filial "0000" não existe na Receita, então nunca colide com um CNPJ real. */
export const CNPJ_FANTASMA_PREFIXO = '9999'

export function cnpjFantasma(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) throw new Error(`Sequência de CNPJ provisório inválida: ${seq}`)
  return `${CNPJ_FANTASMA_PREFIXO}${String(seq).padStart(4, '0')}000000`
}

export function isCnpjFantasma(cnpj: string): boolean {
  const d = onlyDigits(cnpj)
  return d.length === 14 && d.startsWith(CNPJ_FANTASMA_PREFIXO) && d.slice(8, 12) === '0000'
}

function cnpjDv(base12: string): string {
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calc(base12)
  const d2 = calc(base12 + d1)
  return `${d1}${d2}`
}

/** CNPJ real válido: 14 dígitos, não repetidos, dígitos verificadores corretos e fora da faixa fantasma. */
export function isCnpjValido(cnpj: string): boolean {
  const d = onlyDigits(cnpj)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d) || isCnpjFantasma(d)) return false
  return cnpjDv(d.slice(0, 12)) === d.slice(12)
}

export function splitCnpj(cnpj: string) {
  const d = onlyDigits(cnpj)
  return { cnpjRaiz: d.slice(0, 8), cnpjEstabelecimento: d.slice(8, 12), cnpjDv: d.slice(12, 14) }
}

export function formatCnpj(d: string): string {
  const x = onlyDigits(d).padEnd(14, '0')
  return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12, 14)}`
}

// ---------- Telefone ----------

export interface PhoneResult {
  digits: string // com DDI 55 quando reconhecido
  ok: boolean
  aviso?: string
}

/** Normaliza telefone brasileiro para 55+DDD+número. Não "corrige" números: só sinaliza os suspeitos. */
export function normalizePhone(raw: string): PhoneResult {
  let d = onlyDigits(raw)
  if (!d) return { digits: '', ok: false, aviso: 'telefone vazio' }
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return { digits: d, ok: false, aviso: `telefone incompleto ou inválido (${raw.trim()})` }
  const full = `55${d}`
  if (d.length === 10 && /[6-9]/.test(d[2])) return { digits: full, ok: true, aviso: `celular sem o 9º dígito (${raw.trim()})` }
  return { digits: full, ok: true }
}

// ---------- E-mail ----------

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/

export interface EmailResult {
  email: string | null
  aviso?: string
  descartado?: string // texto que não é e-mail (ex.: link do LinkedIn)
}

/** Valida e corrige o defeito de prefixo duplicado ("joao.silvajoao.silva@x.com" → "joao.silva@x.com"). */
export function normalizeEmail(raw: string): EmailResult {
  const t = raw.trim().replace(/^[(<]+|[)>,;.]+$/g, '').toLowerCase()
  if (!t) return { email: null }
  if (!EMAIL_RE.test(t)) return { email: null, descartado: raw.trim(), aviso: `não é e-mail: ${raw.trim()}` }
  const [user, host] = t.split('@')
  const h = user.length / 2
  if (user.length % 2 === 0 && user.length >= 4 && user.slice(0, h) === user.slice(h)) {
    return { email: `${user.slice(0, h)}@${host}`, aviso: `e-mail corrigido (prefixo duplicado): ${t}` }
  }
  return { email: t }
}

/** Separa uma célula com vários valores ("A / B", "A e B", quebras de linha, ";" ou ","). */
export function splitMulti(raw: unknown, { porE = false } = {}): string[] {
  const s = String(raw ?? '')
  const re = porE ? /\s+e\s+|\n|\/|;/ : /\n|\/|;|,/
  return s.split(re).map((x) => x.trim())
}

/** Detecta credenciais em texto livre (ex.: "senha: xxx") para não importá-las. */
export function contemCredencial(texto: string): boolean {
  return /\b(senha|password|pwd)\s*[:=]/i.test(texto)
}
