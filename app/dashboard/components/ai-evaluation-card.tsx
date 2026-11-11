'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react'

/**
 * Card "Análise por IA": gera uma avaliação em linguagem natural dos resultados
 * do período selecionado (resumo executivo + recomendações de verba Meta × Google).
 * Consome a rota /api/ai/evaluate em streaming.
 */
export function AiEvaluationCard({
  dateFrom,
  dateTo,
  periodLabel,
}: {
  dateFrom?: string
  dateTo?: string
  periodLabel?: string
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function gerar() {
    setLoading(true)
    setError(null)
    setText('')
    setDone(false)
    try {
      const res = await fetch('/api/ai/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo, periodLabel }),
      })
      if (!res.ok || !res.body) {
        let msg = 'Não foi possível gerar a avaliação.'
        try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
        setError(msg)
        setLoading(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break
        acc += decoder.decode(value, { stream: true })
        setText(acc)
      }
      setDone(true)
    } catch (e) {
      setError('Erro de conexão ao gerar a avaliação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Análise por IA
          </CardTitle>
          <Button size="sm" onClick={gerar} disabled={loading}>
            {loading ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Gerando…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> {text ? 'Gerar novamente' : 'Gerar avaliação'}</>
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Avaliação automática dos resultados do período{periodLabel ? ` (${periodLabel})` : ''}: resumo executivo e recomendações de verba (Meta × Google).
        </p>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : !text && !loading ? (
          <p className="text-sm text-muted-foreground">
            Clique em <span className="font-medium text-foreground">Gerar avaliação</span> para a IA analisar os números do período selecionado.
          </p>
        ) : (
          <div className="max-w-none">
            <Markdown content={text} />
            {loading && !done ? <span className="inline-block h-4 w-2 animate-pulse bg-primary/60 align-middle" /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Renderizador leve de markdown (títulos ##, listas -, negrito **). */
function Markdown({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  let key = 0

  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-2 ml-5 list-disc space-y-1 text-sm">
          {list.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ''))
      continue
    }
    flushList()
    if (/^###\s+/.test(line)) {
      blocks.push(<h4 key={key++} className="mt-4 mb-1 font-semibold">{renderInline(line.replace(/^###\s+/, ''))}</h4>)
    } else if (/^##\s+/.test(line)) {
      blocks.push(<h3 key={key++} className="mt-5 mb-2 text-base font-bold tracking-tight first:mt-0">{renderInline(line.replace(/^##\s+/, ''))}</h3>)
    } else if (/^#\s+/.test(line)) {
      blocks.push(<h3 key={key++} className="mt-5 mb-2 text-base font-bold tracking-tight first:mt-0">{renderInline(line.replace(/^#\s+/, ''))}</h3>)
    } else if (line.trim() === '') {
      // parágrafo em branco: ignora (espaçamento vem das margens)
    } else {
      blocks.push(<p key={key++} className="my-2 text-sm leading-relaxed">{renderInline(line)}</p>)
    }
  }
  flushList()
  return <>{blocks}</>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}
