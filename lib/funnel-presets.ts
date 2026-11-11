import type { Papel, Resultado } from '@prisma/client'

export type PresetId = 'v1' | 'v2'
export const PRESETS: PresetId[] = ['v1', 'v2']
export const PRESET_LABEL: Record<PresetId, string> = { v1: 'Funil atual (venda tradicional)', v2: 'Funil invertido (captação por mídia)' }
export const ALL_PAPEIS: Papel[] = ['ADMIN', 'DIRETOR', 'GERENTE', 'VENDEDOR']

interface StageDef {
  nome: string
  terminal?: boolean
  resultado?: Resultado
}

export const PRESET_STAGES: Record<PresetId, StageDef[]> = {
  v1: [
    { nome: 'Prospecção' },
    { nome: 'Qualificação' },
    { nome: 'Diagnóstico/Apresentação' },
    { nome: 'Teste/Piloto' },
    { nome: 'Proposta Comercial' },
    { nome: 'Negociação' },
    { nome: 'Fechamento', terminal: true, resultado: 'FECHADO' },
    { nome: 'Perda', terminal: true, resultado: 'PERDIDO' },
  ],
  v2: [
    { nome: 'Lead/Prospecção' },
    { nome: 'Qualificação' },
    { nome: 'Diagnóstico/Apresentação' },
    { nome: 'Teste/Piloto' },
    { nome: 'Proposta Comercial' },
    { nome: 'Negociação' },
    { nome: 'Fechamento', terminal: true, resultado: 'FECHADO' },
    { nome: 'Perda', terminal: true, resultado: 'PERDIDO' },
    { nome: 'Abandonados', terminal: true, resultado: 'PERDIDO' },
  ],
}

/**
 * Transições padrão (por nome de etapa): entrada na 1ª etapa; avanço para a próxima; volta para a anterior;
 * qualquer etapa não terminal → Perda. No v2, o autoatendimento pula de Lead/Prospecção direto para
 * Teste/Piloto, e qualquer etapa não terminal pode ir para Abandonados. Todos os papéis liberados —
 * o Admin restringe depois. Reabrir a partir de etapa terminal não vem liberado por padrão.
 */
export function defaultTransitions(preset: PresetId): { from: string | null; to: string }[] {
  const stages = PRESET_STAGES[preset]
  const open = stages.filter((s) => !s.terminal).map((s) => s.nome)
  const won = stages.find((s) => s.resultado === 'FECHADO')!.nome
  const lost = stages.filter((s) => s.resultado === 'PERDIDO').map((s) => s.nome)
  const t: { from: string | null; to: string }[] = [{ from: null, to: open[0] }]
  open.forEach((nome, i) => {
    t.push({ from: nome, to: open[i + 1] ?? won })
    if (i > 0) t.push({ from: nome, to: open[i - 1] })
    lost.forEach((l) => t.push({ from: nome, to: l }))
  })
  if (preset === 'v2') t.push({ from: 'Lead/Prospecção', to: 'Teste/Piloto' })
  return t
}

export const UFS: [string, string][] = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'],
  ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'],
  ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
  ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
  ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
]
