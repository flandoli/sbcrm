'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Megaphone, ExternalLink, Trophy, AlertTriangle } from 'lucide-react'

interface AdRow {
  adId: string
  adName: string
  campaignName: string
  leads: number
  qualificados: number
  vendas: number
  spend: number
  costPerLead: number
  adUrl: string | null
}

interface AdPerformanceData {
  dateFrom: string
  dateTo: string
  metaConfigured: boolean
  ads: AdRow[]
  error?: string
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return `${((a / b) * 100).toFixed(1)}%`
}

export function AdPerformanceCard({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [data, setData] = useState<AdPerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/meta/ad-performance?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error('Erro ao carregar performance por anúncio:', e)
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

  const ads = data?.ads ?? []
  const hasSpend = ads.some((a) => a.spend > 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5 text-violet-600" />
          Performance por Anúncio
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : ads.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum lead de anúncio no período selecionado.
          </p>
        ) : (
          <>
            {!hasSpend && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Os valores de gasto e custo por lead ainda não estão disponíveis para este período.
                  A contagem de leads e qualificados por anúncio é exibida normalmente.
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">Anúncio / Produto</th>
                    <th className="px-2 py-2 text-right">Leads</th>
                    <th className="px-2 py-2 text-right">Qualif.</th>
                    <th className="px-2 py-2 text-right">Taxa</th>
                    <th className="px-2 py-2 text-right">Vendas</th>
                    <th className="px-2 py-2 text-right">Conv.</th>
                    <th className="px-2 py-2 text-right">Gasto</th>
                    <th className="px-2 py-2 text-right">Custo/Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a, i) => (
                    <tr key={a.adId} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-2 py-2">
                        {i === 0 ? (
                          <Trophy className="h-4 w-4 text-amber-500" />
                        ) : (
                          <span className="text-muted-foreground">{i + 1}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {a.adUrl ? (
                          <a
                            href={a.adUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
                          >
                            {a.adName}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-medium">{a.adName}</span>
                        )}
                        {a.campaignName && (
                          <div className="text-xs text-muted-foreground">{a.campaignName}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{a.leads}</td>
                      <td className="px-2 py-2 text-right">{a.qualificados}</td>
                      <td className="px-2 py-2 text-right">{pct(a.qualificados, a.leads)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-700">
                        {a.vendas > 0 ? a.vendas : <span className="font-normal text-muted-foreground">0</span>}
                      </td>
                      <td className="px-2 py-2 text-right">{pct(a.vendas, a.leads)}</td>
                      <td className="px-2 py-2 text-right">
                        {a.spend > 0 ? fmtMoney(a.spend) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {a.costPerLead > 0 ? (
                          <Badge variant="secondary">{fmtMoney(a.costPerLead)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
