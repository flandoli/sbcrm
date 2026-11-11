export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getRoiSummary } from '@/lib/roi-summary'
import { isExcludedMidia } from '@/lib/sales-utils'

const TRACKING_START_DATE = '2026-07-31'

function getDefaultDateTo(): string {
  const now = new Date()
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return sp.toISOString().slice(0, 10)
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtRoas(r: number | null): string {
  return r === null ? 'n/d' : `${r.toFixed(2)}x`
}
function fmtPct(f: number | null): string {
  return f === null ? 'n/d' : `${(f * 100).toFixed(1)}%`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!process.env.ABACUSAI_API_KEY) {
    return NextResponse.json({ error: 'Serviço de IA não configurado.' }, { status: 500 })
  }

  let body: any = {}
  try { body = await req.json() } catch {}
  const dateFrom = (body?.dateFrom as string) || TRACKING_START_DATE
  const dateTo = (body?.dateTo as string) || getDefaultDateTo()
  const periodLabel = (body?.periodLabel as string) || `${dateFrom} a ${dateTo}`

  const fromDate = new Date(dateFrom + 'T00:00:00-03:00')
  const toDate = new Date(dateTo + 'T23:59:59.999-03:00')

  // ---- Coleta de dados do período ----
  let roi
  try {
    roi = await getRoiSummary(fromDate, toDate, dateFrom, dateTo)
  } catch (e: any) {
    console.error('[AI_EVALUATE] erro ROI:', e?.message)
    return NextResponse.json({ error: 'Falha ao reunir os dados de retorno sobre o investimento.' }, { status: 500 })
  }

  // Vendas do período (dataMatricula) para matrículas/receita/ticket e mídia ajustada.
  const salesRaw = await prisma.sale.findMany({
    where: { dataMatricula: { gte: fromDate, lte: toDate } },
    select: { valorPago: true, matched: true, midia: true, midiaAjustada: true },
  })
  const sales = salesRaw.filter((s) => !isExcludedMidia(s.midia))
  const matriculas = sales.length
  const receita = sales.reduce((s, v) => s + (v.valorPago ?? 0), 0)
  const ticketMedio = matriculas > 0 ? receita / matriculas : 0
  const casadas = sales.filter((s) => s.matched).length

  const midiaMap = new Map<string, { count: number; receita: number }>()
  for (const s of sales) {
    const key = (s.midiaAjustada ?? '').toString().trim() || '(sem mídia)'
    const cur = midiaMap.get(key) ?? { count: 0, receita: 0 }
    cur.count++
    cur.receita += s.valorPago ?? 0
    midiaMap.set(key, cur)
  }
  const porMidia = Array.from(midiaMap.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 12)

  // Leads do período (createdAt).
  const [leadsTotal, leadsQualificados, leadsVcrm, leadsAds, leadsAlunos] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lte: toDate } } }),
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lte: toDate }, status: 'QUALIFICADO' } }),
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lte: toDate }, vaicrmContactId: { not: null } } }),
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lte: toDate }, adId: { not: null }, isAluno: false } }),
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lte: toDate }, status: 'ALUNO' } }),
  ])
  const conversao = leadsTotal > 0 ? (casadas / leadsTotal) * 100 : 0

  // ---- Monta o resumo de dados para a IA ----
  const linhas: string[] = []
  linhas.push(`PERÍODO: ${periodLabel} (${dateFrom} a ${dateTo})`)
  linhas.push('')
  linhas.push('== LEADS ==')
  linhas.push(`- Leads captados no período: ${leadsTotal}`)
  linhas.push(`- Qualificados: ${leadsQualificados}`)
  linhas.push(`- Vindos de anúncio (com adId): ${leadsAds}`)
  linhas.push(`- Originados no VCRM (Vai de Vendas): ${leadsVcrm}`)
  linhas.push(`- Já alunos: ${leadsAlunos}`)
  linhas.push('')
  linhas.push('== VENDAS / MATRÍCULAS ==')
  linhas.push(`- Matrículas: ${matriculas}`)
  linhas.push(`- Receita: ${fmtMoney(receita)}`)
  linhas.push(`- Ticket médio: ${fmtMoney(ticketMedio)}`)
  linhas.push(`- Matrículas casadas com lead de WhatsApp: ${casadas}`)
  linhas.push(`- Conversão (matrículas casadas / leads): ${conversao.toFixed(1)}%`)
  linhas.push('')
  linhas.push('== INVESTIMENTO E RETORNO (ROAS) ==')
  linhas.push(`- Meta configurado: ${roi.metaConfigured ? 'sim' : 'não'} | Google configurado: ${roi.googleConfigured ? 'sim' : 'não'}`)
  linhas.push(`- TOTAL: investimento ${fmtMoney(roi.total.spend)}, receita ${fmtMoney(roi.total.receita)}, ROAS ${fmtRoas(roi.total.roas)}, lucro ${fmtMoney(roi.total.lucro)}, margem ${fmtPct(roi.total.margem)}, matrículas ${roi.total.vendas}`)
  linhas.push(`- META (Facebook/Instagram): investimento ${fmtMoney(roi.meta.spend)}, receita ${fmtMoney(roi.meta.receita)}, ROAS ${fmtRoas(roi.meta.roas)}, lucro ${fmtMoney(roi.meta.lucro)}, margem ${fmtPct(roi.meta.margem)}, matrículas ${roi.meta.vendas}`)
  linhas.push(`- GOOGLE: investimento ${fmtMoney(roi.google.spend)}, receita ${fmtMoney(roi.google.receita)}, ROAS ${fmtRoas(roi.google.roas)}, lucro ${fmtMoney(roi.google.lucro)}, margem ${fmtPct(roi.google.margem)}, matrículas ${roi.google.vendas}`)
  if (roi.organicGroups?.length) {
    linhas.push('- Grupos orgânicos/parceria (sem mídia paga): ' + roi.organicGroups.map((g) => `${g.grupo} ${fmtMoney(g.receita)} (${g.vendas})`).join(', '))
  }
  if (roi.unclassified && (roi.unclassified.receita > 0 || roi.unclassified.vendas > 0)) {
    linhas.push(`- NÃO CLASSIFICADO: receita ${fmtMoney(roi.unclassified.receita)}, matrículas ${roi.unclassified.vendas}`)
  }
  linhas.push('')
  linhas.push('== RECEITA POR MÍDIA AJUSTADA ==')
  if (porMidia.length) {
    for (const m of porMidia) linhas.push(`- ${m.label}: ${m.count} matrícula(s), ${fmtMoney(m.receita)}`)
  } else {
    linhas.push('- (sem dados)')
  }
  const dadosTexto = linhas.join('\n')

  const systemPrompt = `Você é um analista sênior de marketing e performance de uma escola técnica brasileira (Instituto Monitor).
Analise os dados do período e escreva uma avaliação objetiva, para o gestor.
Escreva TODO o texto exclusivamente em português do Brasil — nunca use palavras ou caracteres de outros idiomas (escreva "zero" por extenso, nunca em outra língua).
Use SOMENTE os números fornecidos — nunca invente dados. Quando um dado estiver como "n/d" ou faltar, diga que falta medição em vez de supor.
Valores em reais (R$). ROAS = receita / investimento (quanto maior, melhor); CAC = investimento / matrículas.

Estruture a resposta EXATAMENTE nestas seções, usando markdown:

## Resumo executivo
Um ou dois parágrafos curtos: o que foi bem, o que preocupa, principais destaques do período.

## Recomendações de verba (Meta × Google)
Compare o desempenho de Meta e Google (ROAS, lucro, CAC, volume). Recomende de forma prática onde aumentar, manter ou reduzir investimento, justificando com os números. Aponte canais ineficientes.

## Pontos de atenção
3 a 5 itens em lista, cada um acionável e baseado nos dados (ex.: conversão baixa, mídia com prejuízo, dados não classificados a resolver).

Seja direto e evite jargão. Não repita a tabela de dados; interprete-a.`

  let apiRes: Response
  try {
    apiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        stream: true,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Dados do período:\n\n${dadosTexto}\n\nEscreva a avaliação.` },
        ],
      }),
    })
  } catch (e: any) {
    console.error('[AI_EVALUATE] erro ao chamar LLM:', e?.message)
    return NextResponse.json({ error: 'Falha ao contatar o serviço de IA.' }, { status: 502 })
  }

  if (!apiRes.ok || !apiRes.body) {
    const txt = await apiRes.text().catch(() => '')
    console.error('[AI_EVALUATE] LLM status', apiRes.status, txt.slice(0, 500))
    return NextResponse.json({ error: 'O serviço de IA retornou um erro.' }, { status: 502 })
  }

  // Faz o parse do SSE no servidor e repassa só o texto para a UI.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = apiRes.body!.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let partial = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          partial += decoder.decode(value, { stream: true })
          const lines = partial.split('\n')
          partial = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') { controller.close(); return }
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) controller.enqueue(encoder.encode(delta))
            } catch {
              // ignora linhas não-JSON
            }
          }
        }
      } catch (err) {
        console.error('[AI_EVALUATE] erro de stream:', err)
        controller.error(err)
        return
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
