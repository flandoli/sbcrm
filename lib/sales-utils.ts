// Utilidades para importar a planilha de matrículas (vendas) e cruzar com leads.

/**
 * Normaliza um cabeçalho: minúsculo, sem acentos, sem espaços/pontuação.
 * Ex.: "E_MAIL" -> "email", "Curso_Escolhido" -> "cursoescolhido", "VALOR_PAGO" -> "valorpago".
 */
export function normalizeHeader(h: string): string {
  return (h ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // remove _, espaços, pontuação
    .trim()
}

// Mídias que devem ser totalmente excluídas das Vendas (não contam em matrículas,
// receita, ROAS, "Por mídia" nem no export/conversões). Comparação por texto normalizado (maiúsculas).
export const EXCLUDED_MIDIA = ['LPSP']

/** true se a mídia estiver na lista de exclusão. Trata null/undefined como não-excluída. */
export function isExcludedMidia(midia: string | null | undefined): boolean {
  return EXCLUDED_MIDIA.includes((midia ?? '').trim().toUpperCase())
}

// Cláusula Prisma para excluir as mídias acima em consultas ao banco.
// Usa OR com `midia: null` para NÃO descartar vendas sem mídia preenchida.
// Deve ser combinada via AND (ex.: where.AND = [excludedMidiaWhere]) para não colidir com outros OR.
export const excludedMidiaWhere = {
  OR: [{ midia: null }, { midia: { notIn: EXCLUDED_MIDIA } }],
}

// Mapa: nome de campo interno -> lista de aliases (já normalizados) aceitos no cabeçalho.
const FIELD_ALIASES: Record<string, string[]> = {
  matricula: ['matricula', 'matriculas', 'nmatricula', 'numeromatricula'],
  idEscola: ['idescola', 'escola', 'idesc'],
  dataMatricula: ['datamatricula', 'data', 'datamatri', 'dtmatricula'],
  nome: ['nome', 'aluno', 'nomealuno', 'nomecompleto'],
  email: ['email', 'ema', 'mail'],
  phone: ['celular', 'telefone', 'fone', 'whatsapp', 'cel', 'tel'],
  uf: ['uf', 'estado'],
  curso: ['cursoescolhido', 'curso', 'produto'],
  valorPago: ['valorpago', 'valor', 'valorpg', 'vpago'],
  formaPgto: ['formaspgto', 'formapgto', 'formapagamento', 'formaspagamento', 'pagamento'],
  midia: ['midia', 'media', 'origem'],
  formaContato: ['formacontato', 'contato', 'canalcontato'],
}

export interface ColumnMap {
  // campo interno -> índice da coluna na planilha (ou -1 se ausente)
  [field: string]: number
}

/**
 * Dada a linha de cabeçalho (array de strings), retorna o mapa campo->índice.
 */
export function buildColumnMap(headerRow: any[]): ColumnMap {
  const normalized = headerRow.map((c) => normalizeHeader(String(c ?? '')))
  const map: ColumnMap = {}
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    let idx = -1
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) {
        idx = i
        break
      }
    }
    map[field] = idx
  }
  return map
}

/** Lê uma célula pelo campo interno; retorna string aparada ou '' . */
export function cell(row: any[], map: ColumnMap, field: string): string {
  const idx = map[field]
  if (idx === undefined || idx < 0) return ''
  const v = row[idx]
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/**
 * Detecta um telefone corrompido em notação científica (ex.: "5.51195E+12").
 * Isso acontece quando a coluna de telefone da planilha foi formatada como
 * NÚMERO: ao exportar para CSV o valor vira "5.51195E+12" e os dígitos são
 * perdidos de forma irrecuperável. Nesses casos o cruzamento com leads é
 * impossível e o usuário precisa reexportar a coluna como TEXTO.
 */
export function isScientificNotation(s: string): boolean {
  return /\d[eE][+\-]?\d+/.test(String(s ?? '').trim())
}

/**
 * Obtém o telefone de uma célula priorizando o valor numérico bruto (raw) para
 * evitar a perda de precisão da notação científica.
 *  - Se o valor bruto for um número inteiro (telefone armazenado como número no
 *    XLSX), converte para string inteira completa (sem notação científica).
 *  - Caso contrário, usa o texto formatado.
 * `rawVal` vem da leitura com raw:true; `formattedVal` da leitura com raw:false.
 */
export function phoneCellValue(rawVal: any, formattedVal: string): string {
  if (typeof rawVal === 'number' && isFinite(rawVal)) {
    // Telefone armazenado como número: recupera todos os dígitos.
    // BigInt evita notação científica e mantém a precisão de inteiros.
    try {
      return BigInt(Math.round(rawVal)).toString()
    } catch {
      return String(rawVal)
    }
  }
  const s = String(rawVal ?? '').trim()
  return s || String(formattedVal ?? '').trim()
}

/**
 * Converte valor monetário no formato brasileiro para número.
 * Aceita: "895,9", "1.234,56", "1234.56", "R$ 1.200,00", 895.9 (number).
 * Retorna null se vazio/inválido.
 */
export function parseValor(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw
  let s = String(raw).trim()
  if (!s) return null
  // Remove tudo que não for dígito, vírgula, ponto ou sinal de menos
  s = s.replace(/[^0-9,.-]/g, '')
  if (!s) return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')

  if (hasComma && hasDot) {
    // Formato BR com milhar: "1.234,56" -> remove pontos, vírgula vira ponto
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    // Só vírgula: decimal brasileiro "895,9" -> "895.9"
    s = s.replace(',', '.')
  }
  // Só ponto (ou nenhum): já está em formato parseável
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/**
 * Converte data da planilha para Date (no fuso de São Paulo, UTC-3).
 * Aceita:
 *  - "13/08/26 00:00" (DD/MM/YY HH:MM)
 *  - "13/08/2026 09:14" (DD/MM/YYYY HH:MM)
 *  - "13/08/2026" (DD/MM/YYYY)
 *  - número serial do Excel (dias desde 1899-12-30)
 *  - Date (retorna como está)
 * Retorna null se não conseguir converter.
 */
export function parseDataMatricula(raw: any): Date | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw

  // Número serial do Excel
  if (typeof raw === 'number' && isFinite(raw)) {
    // Excel epoch: 1899-12-30. Dias -> ms.
    const ms = Math.round((raw - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  const s = String(raw).trim()
  if (!s) return null

  // DD/MM/YY(YY) [HH:MM(:SS)]
  const m = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    let year = parseInt(m[3], 10)
    if (year < 100) year += 2000 // "26" -> 2026
    const hour = m[4] ? parseInt(m[4], 10) : 0
    const min = m[5] ? parseInt(m[5], 10) : 0
    const sec = m[6] ? parseInt(m[6], 10) : 0
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    // Monta string ISO com offset de São Paulo (UTC-3) para consistência.
    const pad = (n: number, l = 2) => String(n).padStart(l, '0')
    const iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:${pad(sec)}-03:00`
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d
  }

  // Fallback: tenta o parser nativo
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
