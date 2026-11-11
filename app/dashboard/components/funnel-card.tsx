'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, TrendingDown, ArrowDown, DollarSign, Eye, MousePointerClick, MessageSquare, Users, CheckCircle2, AlertTriangle, CalendarDays } from 'lucide-react'

interface FunnelData {
  configured: boolean
  needsSetup?: boolean
  error?: string
  dateFrom?: string
  dateTo?: string
  meta?: {
    impressions: number
    clicks: number
    spend: number
    conversationsStarted: number
  }
  internal?: {
    totalLeads: number
    novosContatos: number
    fromAds: number
    qualificados: number
  }
  campaigns?: Array<{
    name: string
    id: string
    impressions: number
    clicks: number
    spend: number
    conversationsStarted: number
  }>
  dailyDiff?: Array<{
    date: string
    metaConversas: number
    opaLeads: number
    diff: number
  }>
}

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FunnelCard({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const fetchFunnel = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/meta/funnel?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      setData({ configured: false, error: 'Erro de conexão' })
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchFunnel()
  }, [fetchFunnel])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data || data.needsSetup) {
    return (
      <Card className="border-dashed border-yellow-500/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Funil Meta Ads não configurado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Para visualizar o funil completo (impressões → cliques → conversas → leads), configure as variáveis
                <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">META_AD_ACCOUNT_ID</code> e
                <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">META_ADS_TOKEN</code> nas configurações.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.error && !data.meta) {
    return (
      <Card className="border-dashed border-red-500/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Erro ao buscar dados da Meta</p>
              <p className="text-xs text-muted-foreground mt-1">{data.error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const m = data.meta!
  const i = data.internal!

  // Funil steps
  const steps = [
    {
      label: 'Impressões',
      value: m.impressions,
      icon: Eye,
      color: 'text-sky-400',
      bg: 'bg-sky-400/10',
    },
    {
      label: 'Cliques',
      value: m.clicks,
      icon: MousePointerClick,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      rate: pct(m.clicks, m.impressions),
      rateLabel: 'CTR',
    },
    {
      label: 'Conversas Meta',
      value: m.conversationsStarted,
      icon: MessageSquare,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
      rate: pct(m.conversationsStarted, m.clicks),
      rateLabel: 'Clique→Conversa',
    },
    {
      label: 'Leads Recebidos',
      value: i.fromAds,
      icon: Users,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      rate: m.conversationsStarted > 0 ? pct(i.fromAds, m.conversationsStarted) : '—',
      rateLabel: 'Conversa→Lead',
      delta: m.conversationsStarted > 0 ? m.conversationsStarted - i.fromAds : 0,
    },
    {
      label: 'Qualificados',
      value: i.qualificados,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      rate: pct(i.qualificados, i.fromAds),
      rateLabel: 'Lead→Qualif.',
    },
  ]

  const costPerLead = i.fromAds > 0 ? m.spend / i.fromAds : 0
  const costPerQualified = i.qualificados > 0 ? m.spend / i.qualificados : 0
  const lostLeads = m.conversationsStarted > 0 ? Math.max(0, m.conversationsStarted - i.fromAds) : 0
  // Diferença total no período entre conversas reportadas pela Meta e leads de anúncio recebidos na OpaSuite
  const diffMetaOpa = m.conversationsStarted - i.fromAds

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">Funil Meta Ads</CardTitle>
            {data.dateFrom && data.dateTo && (
              <Badge variant="secondary" className="text-xs font-mono">
                {data.dateFrom} → {data.dateTo}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); fetchFunnel() }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Funil visual */}
        <div className="flex flex-col gap-1">
          {steps.map((step, idx) => {
            const Icon = step.icon
            const maxVal = steps[0].value || 1
            const barWidth = Math.max(15, (step.value / maxVal) * 100)
            return (
              <div key={step.label}>
                {idx > 0 && (
                  <div className="flex items-center gap-2 pl-8 py-0.5">
                    <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
                    {step.rate && step.rate !== '—' && (
                      <span className="text-xs text-muted-foreground">
                        {step.rateLabel}: {step.rate}
                      </span>
                    )}
                    {(step as any).delta > 0 && (
                      <span className="text-xs text-red-400 flex items-center gap-0.5">
                        <TrendingDown className="h-2.5 w-2.5" />
                        {(step as any).delta} perdidos
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${step.bg} shrink-0`}>
                    <Icon className={`h-4 w-4 ${step.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`${step.bg} rounded-md px-3 py-1.5 flex items-center justify-between transition-all`}
                      style={{ width: `${barWidth}%` }}
                    >
                      <span className="text-xs font-medium truncate">{step.label}</span>
                      <span className={`text-sm font-bold font-mono ${step.color} ml-2 shrink-0`}>
                        {fmtNumber(step.value)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Diferença diária Meta × OpaSuite */}
        {data.dailyDiff && data.dailyDiff.length > 0 && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-1.5 mb-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Diferença Meta × OpaSuite por dia</span>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground bg-muted/60 px-3 py-1.5">
                <span>Data</span>
                <span className="text-right">Meta</span>
                <span className="text-right">Opa</span>
                <span className="text-right">Dif.</span>
              </div>
              {data.dailyDiff.map(d => (
                <div key={d.date} className="grid grid-cols-4 text-xs px-3 py-1.5 border-t hover:bg-accent/30">
                  <span className="font-mono text-muted-foreground">{d.date.slice(5)}</span>
                  <span className="text-right font-mono">{d.metaConversas}</span>
                  <span className="text-right font-mono">{d.opaLeads}</span>
                  <span className={`text-right font-mono font-bold ${
                    d.diff > 0 ? 'text-red-400' : d.diff < 0 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {d.diff > 0 ? '+' : ''}{d.diff}
                  </span>
                </div>
              ))}
              {/* Linha de total */}
              <div className="grid grid-cols-4 text-xs font-bold px-3 py-1.5 border-t bg-muted/40">
                <span>Total</span>
                <span className="text-right font-mono">{data.dailyDiff.reduce((s, d) => s + d.metaConversas, 0)}</span>
                <span className="text-right font-mono">{data.dailyDiff.reduce((s, d) => s + d.opaLeads, 0)}</span>
                <span className={`text-right font-mono ${
                  diffMetaOpa > 0 ? 'text-red-400' : diffMetaOpa < 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {diffMetaOpa > 0 ? '+' : ''}{diffMetaOpa}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* KPIs de custo */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-xs">Investimento</span>
            </div>
            <p className="text-sm font-bold font-mono mt-0.5">{fmtMoney(m.spend)}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">CPL (Lead)</span>
            </div>
            <p className="text-sm font-bold font-mono mt-0.5">{costPerLead > 0 ? fmtMoney(costPerLead) : '—'}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-xs">CPL (Qualif.)</span>
            </div>
            <p className="text-sm font-bold font-mono mt-0.5">{costPerQualified > 0 ? fmtMoney(costPerQualified) : '—'}</p>
          </div>
        </div>

        {/* Perda Meta→OpaSuite */}
        {lostLeads > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-400">
                {lostLeads} conversa{lostLeads !== 1 ? 's' : ''} perdida{lostLeads !== 1 ? 's' : ''} entre Meta e OpaSuite
              </p>
              <p className="text-xs text-muted-foreground">
                A Meta reportou {m.conversationsStarted} conversas iniciadas, mas apenas {i.fromAds} chegaram como leads de anúncios.
              </p>
            </div>
          </div>
        )}

        {/* Expandir campanhas */}
        {data.campaigns && data.campaigns.length > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Ocultar' : 'Ver'} campanhas ({data.campaigns.length})
            </Button>
            {expanded && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {data.campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-accent/50">
                    <span className="truncate mr-2 flex-1" title={c.name}>{c.name}</span>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-muted-foreground">
                      <span title="Cliques">{fmtNumber(c.clicks)} cli</span>
                      <span title="Conversas">{fmtNumber(c.conversationsStarted)} conv</span>
                      <span title="Investimento">{fmtMoney(c.spend)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
