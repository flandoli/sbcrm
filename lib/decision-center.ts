import { getAdPerformance, type AdPerformanceRow } from '@/lib/ad-performance'

/**
 * Central de Decisão (Fase 1)
 *
 * Analisa a performance por ANÚNCIO (Meta) e classifica cada anúncio em zonas
 * de decisão de investimento.
 *
 * ESCOLHA DE MÉTRICA (importante):
 *  - A métrica de negócio ideal seria o CAC (custo por matrícula). Porém, no
 *    nível de anúncio, as matrículas casadas a um lead são poucas (a atribuição
 *    depende do telefone/e-mail baterem e tem defasagem de 24-48h), então o CAC
 *    por anúncio fica ruidoso e engana (um anúncio com muitos leads qualificados
 *    baratos pode aparecer com 0 matrículas só por falha de casamento).
 *  - Por isso a CLASSIFICAÇÃO por anúncio usa o CUSTO POR LEAD QUALIFICADO
 *    (gasto / qualificados) comparado à média do período. É um sinal muito mais
 *    estável (centenas de qualificados por anúncio) e robusto ao viés de
 *    atribuição. O CAC, o ROAS e as matrículas casadas são exibidos como
 *    CONFIRMAÇÃO (e são significativos no agregado).
 *
 * Limitações expostas na UI: atribuição parcial de vendas, defasagem 24-48h e
 * limite mínimo de volume por anúncio.
 */

// Limites mínimos de volume para classificar um anúncio (evita decisões sobre
// 2-3 leads). Hardcoded na Fase 1 (não configurável).
export const MIN_LEADS = 10
export const MIN_SPEND = 100

export type Zone = 'escalar' | 'manter' | 'revisar' | 'cortar' | 'insuficiente'

export interface DecisionAd {
  adId: string
  adName: string
  campaignName: string
  adUrl: string | null
  leads: number
  qualificados: number
  vendas: number
  spend: number
  receita: number
  cac: number | null // spend / vendas (null se vendas = 0) — confirmação
  roas: number | null // receita / spend (null se spend = 0) — confirmação
  cpq: number | null // spend / qualificados (null se qualificados = 0) — PRIMÁRIO
  taxaQualif: number // qualificados / leads (fração 0..1)
  costPerLead: number
  zone: Zone
  reason: string
}

export interface ZoneSummary {
  zone: Zone
  count: number
  spend: number
  qualificados: number
  vendas: number
}

export interface DecisionTotals {
  spend: number
  leads: number
  qualificados: number
  vendas: number
  receita: number
  cac: number | null
  roas: number | null
  cpq: number | null
}

export interface DecisionBenchmarks {
  cpq: number | null // gasto total / qualificados totais (custo/qualificado médio)
  cac: number | null // gasto total / vendas totais
  roas: number | null // receita total / gasto total
  medianSpend: number // mediana dos gastos > 0
}

export interface DecisionCenter {
  metaConfigured: boolean
  hasSpend: boolean
  totals: DecisionTotals
  benchmarks: DecisionBenchmarks
  zones: ZoneSummary[]
  ads: DecisionAd[]
  problemas: DecisionAd[] // cortar + revisar (piores primeiro)
  oportunidades: DecisionAd[] // escalar (melhores primeiro)
  resumo: string
  thresholds: { minLeads: number; minSpend: number }
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Classifica um anúncio numa zona de decisão.
 *
 * Sinal PRIMÁRIO: custo por lead qualificado (cpq) vs média do período.
 * Ordem: gate de volume -> Cortar -> Escalar -> Manter -> Revisar.
 */
function classify(
  ad: { leads: number; spend: number; qualificados: number; cpq: number | null },
  bench: DecisionBenchmarks,
): { zone: Zone; reason: string } {
  const { leads, spend, qualificados, cpq } = ad

  // Gate de volume: sem gasto não há como avaliar eficiência de investimento.
  if (spend <= 0) {
    return { zone: 'insuficiente', reason: 'Sem dados de gasto para este anúncio no período.' }
  }
  const classifiable = leads >= MIN_LEADS || spend >= MIN_SPEND
  if (!classifiable) {
    return {
      zone: 'insuficiente',
      reason: `Volume baixo (mín. ${MIN_LEADS} leads ou ${fmtMoney(MIN_SPEND)} de gasto) — sem base para decidir.`,
    }
  }

  const benchCPQ = bench.cpq

  // CORTAR — gasto relevante sem lead qualificado, ou custo/qualificado muito acima da média.
  if (qualificados === 0 && spend >= MIN_SPEND) {
    return {
      zone: 'cortar',
      reason: `${fmtMoney(spend)} gastos sem nenhum lead qualificado no período.`,
    }
  }
  if (cpq !== null && benchCPQ !== null && cpq > benchCPQ * 2) {
    return {
      zone: 'cortar',
      reason: `Custo por qualificado ${fmtMoney(cpq)} — mais que o dobro da média (${fmtMoney(benchCPQ)}).`,
    }
  }

  // Eficiência relativa: custo por qualificado no máximo igual à média do período.
  const efficient = benchCPQ !== null && cpq !== null && cpq <= benchCPQ

  // ESCALAR — qualificados baratos e com espaço para crescer (gasto <= mediana).
  if (efficient && spend <= bench.medianSpend) {
    return {
      zone: 'escalar',
      reason: `Custo por qualificado ${fmtMoney(cpq as number)} abaixo da média (${fmtMoney(benchCPQ as number)}) e gasto ainda baixo — espaço para investir mais.`,
    }
  }

  // MANTER — qualificados baratos, mas já com investimento alto.
  if (efficient) {
    return {
      zone: 'manter',
      reason: `Custo por qualificado ${fmtMoney(cpq as number)} dentro da média — desempenho saudável, manter o investimento.`,
    }
  }

  // REVISAR — tem qualificados, mas custo acima da média (entre 1x e 2x).
  if (cpq !== null && benchCPQ !== null) {
    return {
      zone: 'revisar',
      reason: `Custo por qualificado ${fmtMoney(cpq)} acima da média (${fmtMoney(benchCPQ)}) — avaliar criativo/segmentação antes de manter o gasto.`,
    }
  }

  // Fallback: classificável por volume, mas sem custo/qualificado (benchmark indisponível).
  return {
    zone: 'revisar',
    reason: 'Tem volume, mas ainda sem base de custo por qualificado para medir eficiência — acompanhar.',
  }
}

export async function getDecisionCenter(
  fromDate: Date,
  toDate: Date,
  dateFromStr: string,
  dateToStr: string,
): Promise<DecisionCenter> {
  const { rows, metaConfigured } = await getAdPerformance(fromDate, toDate, dateFromStr, dateToStr)

  // Totais do período.
  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0)
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0)
  const totalQualif = rows.reduce((s, r) => s + r.qualificados, 0)
  const totalVendas = rows.reduce((s, r) => s + r.vendas, 0)
  const totalReceita = rows.reduce((s, r) => s + r.receita, 0)

  const totals: DecisionTotals = {
    spend: totalSpend,
    leads: totalLeads,
    qualificados: totalQualif,
    vendas: totalVendas,
    receita: totalReceita,
    cac: totalVendas > 0 && totalSpend > 0 ? totalSpend / totalVendas : null,
    roas: totalSpend > 0 ? totalReceita / totalSpend : null,
    cpq: totalQualif > 0 && totalSpend > 0 ? totalSpend / totalQualif : null,
  }

  const hasSpend = totalSpend > 0

  // Benchmarks agregados (blended) do próprio período.
  const spends = rows.map((r) => r.spend ?? 0).filter((s) => s > 0)
  const benchmarks: DecisionBenchmarks = {
    cpq: totals.cpq,
    cac: totals.cac,
    roas: totals.roas,
    medianSpend: median(spends),
  }

  // Monta e classifica cada anúncio.
  const ads: DecisionAd[] = rows.map((r: AdPerformanceRow) => {
    const cac = r.vendas > 0 && r.spend > 0 ? r.spend / r.vendas : null
    const roas = r.spend > 0 ? r.receita / r.spend : null
    const cpq = r.qualificados > 0 && r.spend > 0 ? r.spend / r.qualificados : null
    const base = {
      adId: r.adId,
      adName: r.adName,
      campaignName: r.campaignName,
      adUrl: r.adUrl,
      leads: r.leads,
      qualificados: r.qualificados,
      vendas: r.vendas,
      spend: r.spend ?? 0,
      receita: r.receita,
      cac,
      roas,
      cpq,
      taxaQualif: r.leads > 0 ? r.qualificados / r.leads : 0,
      costPerLead: r.costPerLead,
    }
    const { zone, reason } = classify(
      { leads: r.leads, spend: r.spend ?? 0, qualificados: r.qualificados, cpq },
      benchmarks,
    )
    return { ...base, zone, reason }
  })

  // Resumo por zona.
  const zoneOrder: Zone[] = ['escalar', 'manter', 'revisar', 'cortar', 'insuficiente']
  const zones: ZoneSummary[] = zoneOrder.map((zone) => {
    const inZone = ads.filter((a) => a.zone === zone)
    return {
      zone,
      count: inZone.length,
      spend: inZone.reduce((s, a) => s + a.spend, 0),
      qualificados: inZone.reduce((s, a) => s + a.qualificados, 0),
      vendas: inZone.reduce((s, a) => s + a.vendas, 0),
    }
  })

  const nManter = ads.filter((a) => a.zone === 'manter').length

  // Problemas: cortar + revisar, piores primeiro (maior gasto pouco produtivo).
  const problemas = ads
    .filter((a) => a.zone === 'cortar' || a.zone === 'revisar')
    .sort((a, b) => {
      if (a.zone !== b.zone) return a.zone === 'cortar' ? -1 : 1
      return b.spend - a.spend
    })

  // Oportunidades: escalar, melhores primeiro (menor custo por qualificado;
  // desempate por presença de matrículas casadas e por volume de qualificados).
  const oportunidades = ads
    .filter((a) => a.zone === 'escalar')
    .sort((a, b) => {
      const ca = a.cpq ?? Number.POSITIVE_INFINITY
      const cb = b.cpq ?? Number.POSITIVE_INFINITY
      if (ca !== cb) return ca - cb
      if (b.vendas !== a.vendas) return b.vendas - a.vendas
      return b.qualificados - a.qualificados
    })

  // Resumo textual determinístico (pt-BR). LLM fica para a Fase 2.
  const nProblemas = problemas.length
  const gastoProblema = problemas.reduce((s, a) => s + a.spend, 0)
  let resumo: string
  if (!hasSpend) {
    resumo =
      'Ainda não há dados de gasto de anúncios para este período, então não é possível calcular custo por qualificado, CAC ou ROAS. ' +
      'A contagem de leads, qualificados e matrículas por anúncio continua disponível abaixo.'
  } else {
    const cpqTxt = totals.cpq !== null ? fmtMoney(totals.cpq) : '—'
    const cacTxt = totals.cac !== null ? fmtMoney(totals.cac) : '—'
    resumo =
      `No período, ${fmtMoney(totalSpend)} investidos geraram ${totalQualif} leads qualificados ` +
      `(custo médio ${cpqTxt} por qualificado) e ${totalVendas} matrícula(s) casada(s) (CAC médio ${cacTxt}). ` +
      `Classificando cada anúncio pelo custo por qualificado: ${oportunidades.length} com espaço para escalar, ` +
      `${nManter} para manter e ${nProblemas} precisam de atenção` +
      (nProblemas > 0 ? ` (${fmtMoney(gastoProblema)} em gasto pouco produtivo)` : '') +
      `.`
  }

  return {
    metaConfigured,
    hasSpend,
    totals,
    benchmarks,
    zones,
    ads,
    problemas,
    oportunidades,
    resumo,
    thresholds: { minLeads: MIN_LEADS, minSpend: MIN_SPEND },
  }
}
