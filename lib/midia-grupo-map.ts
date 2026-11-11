/**
 * Mapeamento canônico MIDIA AJUSTADA -> GRUPO MACRO.
 *
 * Extraído da planilha completa MIDIAJUSTADA_LEADQ, que é internamente
 * consistente. A relação é DETERMINÍSTICA: uma mesma MIDIA AJUSTADA pertence
 * sempre ao mesmo GRUPO MACRO.
 *
 * Serve de "fonte da verdade" para validar planilhas de classificação: se a
 * coluna GRUPO MACRO de uma planilha contradiz o grupo derivado da MIDIA
 * AJUSTADA, a planilha está desalinhada e deve ser rejeitada — foi justamente
 * uma planilha com a coluna GRUPO MACRO deslocada que corrompeu a base antes.
 */

export function normalizeClass(v: string | null | undefined): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/**
 * Deriva o GRUPO MACRO a partir da MIDIA AJUSTADA.
 * Retorna null quando a MIDIA AJUSTADA é desconhecida (não há como validar).
 */
export function deriveGrupoMacro(midiaAjustada: string | null | undefined): string | null {
  const m = normalizeClass(midiaAjustada)
  if (!m) return null

  // GOOGLE_META precisa ser testado ANTES de GOOGLE/META (contém os dois).
  if (m.startsWith('GOOGLE_META') || m.startsWith('GOOGLE META')) return 'GOOGLE_META'
  if (m.startsWith('GOOGLE')) return 'GOOGLE'
  if (m.startsWith('LEADST')) return 'GOOGLE'
  if (m.startsWith('META')) return 'META'
  if (m === 'IA') return 'IA'
  if (m === 'ACTIVE') return 'ACTIVE'
  if (m === 'CELERA') return 'CELERA'
  if (m === 'CHATGPT') return 'CHATGPT'
  if (m === 'RM' || m === 'DESCONSIDERAR' || m === 'REPETIDO') return 'NÃO USAR'

  return null
}
