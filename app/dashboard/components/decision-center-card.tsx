'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  Compass,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Scissors,
  ExternalLink,
  Lightbulb,
  Wallet,
  GraduationCap,
  Target,
  Percent,
} from 'lucide-react'

type Zone = 'escalar' | 'manter' | 'revisar' | 'cortar' | 'insuficiente'

interface DecisionAd {
  adId: string
  adName: string
  campaignName: string
  adUrl: string | null
  leads: number
  qualificados: number
  vendas: number
  spend: number
  receita: number
  cac: number | null
  roas: number | null
  cpq: number | null
  taxaQualif: number
  costPerLead: number
  zone: Zone
  reason: string
}

interface ZoneSummary {
  zone: Zone
  count: number
  spend: number
  qualificados: number
  vendas: number
}

interface DecisionData {
  dateFrom: string
  dateTo: string
  metaConfigured: boolean
  hasSpend: boolean
  totals: {
    spend: number
    leads: number
    qualificados: number
    vendas: number
    receita: number
    cac: number | null
    roas: number | null
    cpq: number | null
  }
  benchmarks: { cpq: number | null; cac: number | null; roas: number | null; medianSpend: number }
  zones: ZoneSummary[]
  ads: DecisionAd[]
  problemas: DecisionAd[]
  oportunidades: DecisionAd[]
  resumo: string
  thresholds: { minLeads: number; minSpend: number }
  error?: string
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ZONE_META: Record<
  Zone,
  { label: string; color: string; bg: string; border: string; icon: any }
> = {
  escalar: {
    label: 'Escalar',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: TrendingUp,
  },
  manter: {
    label: 'Manter',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: CheckCircle2,
  },
  revisar: {
    label: 'Revisar',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: AlertTriangle,
  },
  cortar: {
    label: 'Cortar',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: Scissors,
  },
  insuficiente: {
    label: 'Sem base',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: TrendingDown,
  },
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

function AdLine({ ad }: { ad: DecisionAd }) {
  const m = ZONE_META[ad.zone]
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {ad.adUrl ? (
            <a
              href={ad.adUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 truncate font-medium text-violet-700 hover:underline"
            >
              {ad.adName}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate font-medium">{ad.adName}</span>
          )}
          <Badge variant="outline" className={`shrink-0 ${m.color} ${m.border}`}>
            {m.label}
          </Badge>
        </div>
        {ad.campaignName && (
          <div className="truncate text-xs text-muted-foreground">{ad.campaignName}</div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">{ad.reason}</div>
      </div>
      <div className="shrink-0 text-right text-xs">
        <div className="font-semibold">
          {ad.cpq !== null ? `${fmtMoney(ad.cpq)}/qual.` : '—'}
        </div>
        <div className="text-muted-foreground">{ad.qualificados} qualif. · {fmtMoney(ad.spend)}</div>
        <div className="text-muted-foreground">
          {ad.vendas} matr.{ad.cac !== null ? ` · CAC ${fmtMoney(ad.cac)}` : ''}
        </div>
      </div>
    </div>
  )
}

export function DecisionCenterCard({
  dateFrom,
  dateTo,
}: {
  dateFrom?: string
  dateTo?: string
}) {
  const [data, setData] = useState<DecisionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/decision-center?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error('Erro ao carregar a Central de Decisão:', e)
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

  const totals = data?.totals
  const zones = data?.zones ?? []
  const problemas = data?.problemas ?? []
  const oportunidades = data?.oportunidades ?? []

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Compass className="h-5 w-5 text-primary" />
          Central de Decisão
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data || (data.ads.length === 0) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum anúncio com leads no período selecionado.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{data.resumo}</span>
            </div>

            {/* Aviso: sem gasto */}
            {!data.hasSpend && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Os valores de gasto de anúncios ainda não estão disponíveis para este período,
                  então CAC, ROAS e as recomendações de alocação ficam indisponíveis. As contagens
                  de leads e matrículas por anúncio continuam válidas.
                </span>
              </div>
            )}

            {/* KPIs */}
            {totals && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi
                  icon={Wallet}
                  label="Investido"
                  value={fmtMoney(totals.spend)}
                  hint={`${totals.leads} leads`}
                />
                <Kpi
                  icon={Target}
                  label="Custo / qualificado"
                  value={totals.cpq !== null ? fmtMoney(totals.cpq) : '—'}
                  hint={`${totals.qualificados} qualificados`}
                />
                <Kpi
                  icon={GraduationCap}
                  label="CAC médio"
                  value={totals.cac !== null ? fmtMoney(totals.cac) : '—'}
                  hint={`${totals.vendas} matrículas casadas`}
                />
                <Kpi
                  icon={Percent}
                  label="ROAS"
                  value={totals.roas !== null ? `${totals.roas.toFixed(2)}x` : '—'}
                  hint="referência (subestimado)"
                />
              </div>
            )}

            {/* Zonas */}
            {data.hasSpend && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {zones
                  .filter((z) => z.zone !== 'insuficiente' || z.count > 0)
                  .map((z) => {
                    const m = ZONE_META[z.zone]
                    const Icon = m.icon
                    return (
                      <div
                        key={z.zone}
                        className={`rounded-lg border ${m.border} ${m.bg} p-3`}
                      >
                        <div className={`flex items-center gap-1.5 text-xs font-medium ${m.color}`}>
                          <Icon className="h-4 w-4" />
                          {m.label}
                        </div>
                        <div className={`mt-1 text-2xl font-bold ${m.color}`}>{z.count}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtMoney(z.spend)} · {z.qualificados} qualif.
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Oportunidades e Problemas */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <TrendingUp className="h-4 w-4" />
                  Oportunidades para escalar
                </h4>
                {oportunidades.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Nenhum anúncio com espaço claro para escalar no momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {oportunidades.slice(0, 5).map((ad) => (
                      <AdLine key={ad.adId} ad={ad} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Problemas para revisar/cortar
                </h4>
                {problemas.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Nenhum anúncio problemático no período. 🎉
                  </p>
                ) : (
                  <div className="space-y-2">
                    {problemas.slice(0, 5).map((ad) => (
                      <AdLine key={ad.adId} ad={ad} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Nota de rodapé / caveats */}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Análise no nível de anúncio (Meta). A classificação usa o <strong>custo por lead
              qualificado</strong> (sinal mais estável), porque as matrículas casadas a um lead
              são poucas por anúncio. CAC, ROAS e matrículas aparecem como confirmação e ficam
              conservadores (CAC mais alto, ROAS mais baixo) por causa da atribuição parcial, que
              ainda tem defasagem de 24–48h. Anúncios com menos de {data.thresholds.minLeads} leads
              e {fmtMoney(data.thresholds.minSpend)} de gasto não são classificados (“sem base”).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
