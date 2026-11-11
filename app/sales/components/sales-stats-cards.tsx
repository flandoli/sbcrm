'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DollarSign,
  GraduationCap,
  Receipt,
  Megaphone,
  TrendingUp,
  Link2,
  Target,
} from 'lucide-react'

export interface SalesStats {
  matriculas: number
  receita: number
  ticketMedio: number
  casadas: number
  naoCasadas: number
  leadsNoPeriodo: number
  conversao: number
  investimento: number
  metaSpend?: number
  googleSpend?: number
  roas: number
  cac: number
  metaConfigured: boolean
  googleConfigured?: boolean
}

function money(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function SalesStatsCards({
  stats,
  loading,
  periodLabel,
  origem,
}: {
  stats: SalesStats | null
  loading: boolean
  periodLabel?: string
  origem?: '' | 'whatsapp'
}) {
  const isWhats = origem === 'whatsapp'
  const tag = isWhats ? 'WhatsApp' : 'Geral'
  const cards = [
    {
      key: 'receita',
      label: 'Receita',
      value: stats ? money(stats.receita) : '—',
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      sub: periodLabel ? `Receita ${tag} • ${periodLabel}` : `Receita ${tag}`,
    },
    {
      key: 'matriculas',
      label: 'Matrículas',
      value: stats ? String(stats.matriculas) : '—',
      icon: GraduationCap,
      color: 'text-sky-400',
      bg: 'bg-sky-400/10',
      sub: `Matrículas ${tag}`,
    },
    {
      key: 'ticket',
      label: 'Ticket médio',
      value: stats ? money(stats.ticketMedio) : '—',
      icon: Receipt,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      sub: 'Ticket médio',
    },
    {
      key: 'investimento',
      label: 'Investimento',
      value: stats ? money(stats.investimento) : '—',
      icon: Megaphone,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
      sub: stats && (stats.metaSpend || stats.googleSpend)
        ? `Meta ${money(stats.metaSpend ?? 0)} + Google ${money(stats.googleSpend ?? 0)}`
        : 'Investimento em anúncios',
    },
    {
      key: 'roas',
      label: 'ROAS',
      value: stats && stats.investimento > 0 ? `${stats.roas.toFixed(2)}x` : '—',
      icon: TrendingUp,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      sub: isWhats ? 'Retorno direto (WhatsApp)' : 'Retorno s/ investimento',
    },
    {
      key: 'cac',
      label: 'CAC',
      value: stats && stats.cac > 0 ? money(stats.cac) : '—',
      icon: Target,
      color: 'text-orange-400',
      bg: 'bg-orange-400/10',
      sub: isWhats ? 'Custo por matrícula (direto)' : 'Custo por matrícula',
    },
    {
      key: 'conversao',
      label: 'Conversão',
      value: stats ? `${stats.conversao.toFixed(1)}%` : '—',
      icon: Link2,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
      sub: stats ? `${stats.casadas} de ${stats.leadsNoPeriodo} leads` : 'Leads → matrícula',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <Card key={c.key} className="overflow-hidden">
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg shrink-0 ${c.bg}`}>
                    <Icon className={`h-6 w-6 ${c.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold font-mono tracking-tight">{c.value}</p>
                    <p className="text-xs font-medium text-muted-foreground truncate">{c.sub}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
