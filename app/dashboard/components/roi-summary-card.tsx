'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Facebook, Globe, Layers } from 'lucide-react'

interface RoiFront {
  spend: number
  receita: number
  vendas: number
  roas: number | null
  lucro: number
  margem: number | null
}

interface OrganicGroup {
  grupo: string
  receita: number
  vendas: number
}

interface RoiData {
  dateFrom: string
  dateTo: string
  metaConfigured: boolean
  googleConfigured: boolean
  total: RoiFront
  meta: RoiFront
  google: RoiFront
  googlePlatform?: {
    convValue: number
    conversions: number
    roas: number | null
  }
  organicGroups?: OrganicGroup[]
  unclassified?: { receita: number; vendas: number }
  error?: string
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtRoas(roas: number | null): string {
  if (roas === null) return '—'
  return `${roas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
}

function fmtPct(f: number | null): string {
  if (f === null) return '—'
  return `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`
}

const GRUPO_LABELS: Record<string, string> = {
  IA: 'Indicação de Aluno',
  CELERA: 'Celera (parceiro)',
  CHATGPT: 'ChatGPT',
  ACTIVE: 'E-mail (Active)',
  GOOGLE_META: 'Google + Meta',
}

function FrontPanel({
  title,
  icon,
  accent,
  front,
  note,
  secondary,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  front: RoiFront
  note?: string
  secondary?: React.ReactNode
}) {
  const positivo = front.lucro >= 0
  return (
    <div className="flex flex-col rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={accent}>{icon}</span>
        <span className="font-semibold">{title}</span>
      </div>

      {/* ROAS — destaque */}
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Retorno (ROAS)</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmtRoas(front.roas)}
          </span>
          {front.roas !== null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {positivo ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-rose-600" />}
              para cada R$ 1 investido
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Investimento</dt>
          <dd className="font-semibold">{fmtMoney(front.spend)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Receita</dt>
          <dd className="font-semibold text-emerald-700">{fmtMoney(front.receita)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Lucro</dt>
          <dd className={`font-semibold ${positivo ? 'text-emerald-700' : 'text-rose-600'}`}>
            {fmtMoney(front.lucro)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Margem</dt>
          <dd className="font-semibold">{fmtPct(front.margem)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Matrículas</dt>
          <dd className="font-semibold">{front.vendas}</dd>
        </div>
      </dl>

      {secondary}

      {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

export function RoiSummaryCard({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [data, setData] = useState<RoiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/roi-summary?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error('Erro ao carregar retorno sobre investimento:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Retorno sobre o investimento (WhatsApp)
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !data || data.error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {data?.error ?? 'Não foi possível calcular o retorno sobre o investimento.'}
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <FrontPanel
                title="Total (Meta + Google)"
                icon={<Layers className="h-5 w-5" />}
                accent="text-indigo-600"
                front={data.total}
                note="Investimento e receita somados das duas plataformas no período (classificação por Grupo Macro)."
              />
              <FrontPanel
                title="Meta"
                icon={<Facebook className="h-5 w-5" />}
                accent="text-blue-600"
                front={data.meta}
                note={
                  data.metaConfigured
                    ? 'Receita: vendas classificadas como Grupo Macro "META" na planilha de mídia. Investimento: campanhas monitoradas.'
                    : 'Meta Ads não configurado: investimento pode aparecer como R$ 0.'
                }
              />
              <FrontPanel
                title="Google"
                icon={<Globe className="h-5 w-5" />}
                accent="text-amber-600"
                front={data.google}
                secondary={
                  data.googlePlatform ? (
                    <div className="mt-3 rounded-md bg-muted/60 p-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        ROAS pela atribuição do Google
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-amber-700">
                          {fmtRoas(data.googlePlatform.roas)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({fmtMoney(data.googlePlatform.convValue)} em conversões do Google)
                        </span>
                      </div>
                    </div>
                  ) : undefined
                }
                note={
                  data.googleConfigured
                    ? 'Receita: vendas classificadas como Grupo Macro "GOOGLE" na planilha de mídia. Investimento: conta Google inteira.'
                    : 'Google Ads não configurado: investimento pode aparecer como R$ 0.'
                }
              />
            </div>

            {/* Grupos orgânicos / parceria */}
            {data.organicGroups && data.organicGroups.length > 0 && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Receita orgânica / parceria (sem mídia paga)</h4>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  {data.organicGroups.map((g) => (
                    <div key={g.grupo} className="rounded-md border bg-card p-3 text-sm">
                      <p className="font-medium">{GRUPO_LABELS[g.grupo] ?? g.grupo}</p>
                      <p className="text-lg font-bold text-emerald-700">{fmtMoney(g.receita)}</p>
                      <p className="text-xs text-muted-foreground">{g.vendas} matrícula{g.vendas !== 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.unclassified && data.unclassified.vendas > 0 && (
              <p className="mt-2 text-xs text-amber-600">
                {data.unclassified.vendas} venda{data.unclassified.vendas !== 1 ? 's' : ''} sem classificação
                ({fmtMoney(data.unclassified.receita)}) — envie a planilha de classificação em Vendas para atualizar.
              </p>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Receita atribuída pela <strong>classificação de mídia (Grupo Macro)</strong> da planilha
              diária. Só GOOGLE e META têm investimento pago. ROAS = receita ÷ investimento.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
