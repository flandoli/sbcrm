'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw, TrendingUp, Users, CheckCircle2, DollarSign,
  GraduationCap, ChevronDown, ChevronUp, Search as SearchIcon,
} from 'lucide-react'

interface CampaignRow {
  campaignId: string
  campaignName: string
  leads: number
  qualificados: number
  matriculas: number
  receita: number
  spend: number
  cpl: number
  cpql: number
  cac: number
  roas: number
  gConversions: number
  gConvValue: number
  gRoas: number
}

interface PerfData {
  dateFrom: string
  dateTo: string
  googleConfigured: boolean
  totalSpend: number
  totalLeads: number
  totalQualificados: number
  totalMatriculas: number
  totalReceita: number
  totalGConversions: number
  totalGConvValue: number
  rows: CampaignRow[]
  error?: string
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPct(a: number, b: number): string {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

export function GoogleAdsPerformance({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [data, setData] = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/google-ads/performance?${params.toString()}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    )
  }

  if (!data || !data.googleConfigured) {
    return null // Não exibe se Google Ads não configurado
  }

  const { rows, totalSpend, totalLeads, totalQualificados, totalMatriculas, totalReceita, totalGConversions, totalGConvValue } = data
  const cplGeral = totalLeads > 0 ? totalSpend / totalLeads : 0
  const roasGeral = totalSpend > 0 ? totalReceita / totalSpend : 0
  const cacGeral = totalMatriculas > 0 ? totalSpend / totalMatriculas : 0
  const gRoasGeral = totalSpend > 0 ? totalGConvValue / totalSpend : 0
  const gCac = totalGConversions > 0 ? totalSpend / totalGConversions : 0

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <SearchIcon className="h-5 w-5 text-amber-400" />
          Performance Google Ads
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setLoading(true); fetchData() }} className="h-7 w-7">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-7 px-2 text-xs">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Recolher' : 'Expandir'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumo geral */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard icon={<DollarSign className="h-4 w-4" />} label="Investimento" value={fmtMoney(totalSpend)} color="text-amber-400" />
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Leads" value={String(totalLeads)} color="text-blue-400" />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Qualificados" value={String(totalQualificados)} sublabel={fmtPct(totalQualificados, totalLeads)} color="text-green-400" />
          <SummaryCard icon={<DollarSign className="h-4 w-4" />} label="CPL" value={fmtMoney(cplGeral)} color="text-orange-400" />
          <SummaryCard icon={<GraduationCap className="h-4 w-4" />} label="Matrículas" value={String(totalMatriculas)} sublabel={`CAC ${fmtMoney(cacGeral)}`} color="text-purple-400" />
          <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="ROAS" value={roasGeral > 0 ? `${roasGeral.toFixed(2)}x` : '—'} sublabel={fmtMoney(totalReceita)} color="text-emerald-400" />
        </div>

        {/* Atribuição do próprio Google (tags GTM/GA4) */}
        <div className="pt-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atribuição do Google (tags GTM/GA4)</span>
            <span className="text-[11px] text-muted-foreground">— conversões e receita reportadas pelo próprio Google</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard icon={<GraduationCap className="h-4 w-4" />} label="Conversões (Google)" value={totalGConversions > 0 ? totalGConversions.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0'} sublabel={gCac > 0 ? `CAC ${fmtMoney(gCac)}` : undefined} color="text-fuchsia-400" />
            <SummaryCard icon={<DollarSign className="h-4 w-4" />} label="Receita (Google)" value={fmtMoney(totalGConvValue)} color="text-emerald-400" />
            <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="ROAS (Google)" value={gRoasGeral > 0 ? `${gRoasGeral.toFixed(2)}x` : '—'} color="text-cyan-400" />
          </div>
        </div>

        {/* Tabela por campanha */}
        {expanded && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-3 font-medium">Campanha</th>
                  <th className="text-right py-2 px-2 font-medium">Invest.</th>
                  <th className="text-right py-2 px-2 font-medium">Leads</th>
                  <th className="text-right py-2 px-2 font-medium">Qualif.</th>
                  <th className="text-right py-2 px-2 font-medium">CPL</th>
                  <th className="text-right py-2 px-2 font-medium">Matr.</th>
                  <th className="text-right py-2 px-2 font-medium">Receita</th>
                  <th className="text-right py-2 px-2 font-medium">ROAS</th>
                  <th className="text-right py-2 px-2 font-medium text-cyan-400/90">Conv. Google</th>
                  <th className="text-right py-2 px-2 font-medium text-cyan-400/90">Receita Google</th>
                  <th className="text-right py-2 pl-2 font-medium text-cyan-400/90">ROAS Google</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.campaignId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-3 max-w-[200px] truncate" title={r.campaignName}>
                      {r.campaignName}
                    </td>
                    <td className="text-right py-2 px-2 text-amber-400 font-medium">{fmtMoney(r.spend)}</td>
                    <td className="text-right py-2 px-2">{r.leads}</td>
                    <td className="text-right py-2 px-2">
                      {r.qualificados}
                      {r.leads > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">({fmtPct(r.qualificados, r.leads)})</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-2 text-orange-400">{r.leads > 0 ? fmtMoney(r.cpl) : '—'}</td>
                    <td className="text-right py-2 px-2">
                      {r.matriculas > 0 ? (
                        <Badge variant="outline" className="text-purple-400 border-purple-400/30">{r.matriculas}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-2 text-emerald-400">{r.receita > 0 ? fmtMoney(r.receita) : '—'}</td>
                    <td className="text-right py-2 px-2 font-semibold">
                      {r.roas > 0 ? (
                        <span className={r.roas >= 1 ? 'text-emerald-400' : 'text-red-400'}>
                          {r.roas.toFixed(2)}x
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right py-2 px-2 text-fuchsia-400">{r.gConversions > 0 ? r.gConversions.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
                    <td className="text-right py-2 px-2 text-emerald-400/90">{r.gConvValue > 0 ? fmtMoney(r.gConvValue) : '—'}</td>
                    <td className="text-right py-2 pl-2 font-semibold">
                      {r.gRoas > 0 ? (
                        <span className={r.gRoas >= 1 ? 'text-cyan-400' : 'text-red-400'}>
                          {r.gRoas.toFixed(2)}x
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Linha total */}
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="text-right py-2 px-2 text-amber-400">{fmtMoney(totalSpend)}</td>
                  <td className="text-right py-2 px-2">{totalLeads}</td>
                  <td className="text-right py-2 px-2">{totalQualificados}</td>
                  <td className="text-right py-2 px-2 text-orange-400">{fmtMoney(cplGeral)}</td>
                  <td className="text-right py-2 px-2">{totalMatriculas}</td>
                  <td className="text-right py-2 px-2 text-emerald-400">{totalReceita > 0 ? fmtMoney(totalReceita) : '—'}</td>
                  <td className="text-right py-2 px-2">{roasGeral > 0 ? `${roasGeral.toFixed(2)}x` : '—'}</td>
                  <td className="text-right py-2 px-2 text-fuchsia-400">{totalGConversions > 0 ? totalGConversions.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
                  <td className="text-right py-2 px-2 text-emerald-400/90">{totalGConvValue > 0 ? fmtMoney(totalGConvValue) : '—'}</td>
                  <td className="text-right py-2 pl-2 text-cyan-400">{gRoasGeral > 0 ? `${gRoasGeral.toFixed(2)}x` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {expanded && rows.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <SearchIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum lead Google Ads no período.</p>
            <p className="text-xs mt-1">Configure o tracking template no Google Ads para começar a rastrear leads por campanha.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryCard({ icon, label, value, sublabel, color }: {
  icon: React.ReactNode; label: string; value: string; sublabel?: string; color: string
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground`}>
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  )
}
