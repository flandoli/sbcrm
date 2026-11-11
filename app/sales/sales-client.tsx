'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { AppShell } from '@/components/layouts/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  LayoutDashboard,
  Settings,
  LogOut,
  RefreshCw,
  ShoppingCart,
  BookOpen,
  CreditCard,
  Radio,
  Search,
  MessageCircle,
  Download,
  Send,
  FileBarChart,
} from 'lucide-react'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { ThemeLogo } from '@/components/theme-logo'
import Link from 'next/link'
import { SalesStatsCards, SalesStats } from './components/sales-stats-cards'
import { SalesUploadCard } from './components/sales-upload-card'
import { ClassificationUploadCard } from './components/classification-upload-card'
import { SalesBreakdownCard, BreakdownRow } from './components/sales-breakdown-card'
import { SalesTable, SaleRow } from './components/sales-table'

interface FullStats extends SalesStats {
  porCurso: BreakdownRow[]
  porFormaPgto: BreakdownRow[]
  porMidia: BreakdownRow[]
}

export function SalesClient() {
  const { data: session, status: authStatus } = useSession() || {}
  const [stats, setStats] = useState<FullStats | null>(null)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sendingConv, setSendingConv] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [origem, setOrigem] = useState<'' | 'whatsapp'>('')
  const [matchFilter, setMatchFilter] = useState<'' | 'matched' | 'unmatched'>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  const todaySP = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const monthStartSP = todaySP.slice(0, 7) + '-01'
  const [ty, tm] = todaySP.split('-').map(Number)
  const pmYear = tm === 1 ? ty - 1 : ty
  const pmMonth = tm === 1 ? 12 : tm - 1
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const lastMonthStartSP = `${pmYear}-${pad2(pmMonth)}-01`
  const lastMonthEndSP = `${pmYear}-${pad2(pmMonth)}-${pad2(new Date(pmYear, pmMonth, 0).getDate())}`

  const setPeriod = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    setPage(1)
  }

  const activePeriod =
    !dateFrom && !dateTo
      ? 'all'
      : dateFrom === todaySP && dateTo === todaySP
      ? 'today'
      : dateFrom === monthStartSP && dateTo === todaySP
      ? 'month'
      : dateFrom === lastMonthStartSP && dateTo === lastMonthEndSP
      ? 'lastMonth'
      : 'custom'

  const fmtBR = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }
  const periodLabel =
    activePeriod === 'all'
      ? 'Todo o período'
      : activePeriod === 'today'
      ? 'Hoje'
      : activePeriod === 'month'
      ? 'Este mês'
      : activePeriod === 'lastMonth'
      ? 'Mês passado'
      : dateFrom && dateTo
      ? `${fmtBR(dateFrom)} – ${fmtBR(dateTo)}`
      : dateFrom
      ? `A partir de ${fmtBR(dateFrom)}`
      : `Até ${fmtBR(dateTo)}`

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (origem) params.set('origem', origem)
      const res = await fetch(`/api/sales/stats?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setStats(data)
    } catch {}
  }, [dateFrom, dateTo, origem])

  const fetchSales = useCallback(async () => {
    setTableLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (matchFilter) params.set('match', matchFilter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(limit))
      const res = await fetch(`/api/sales?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setSales(data?.sales ?? [])
      setTotal(data?.total ?? 0)
    } catch {
    } finally {
      setTableLoading(false)
    }
  }, [dateFrom, dateTo, matchFilter, search, page])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchStats(), fetchSales()])
    setRefreshing(false)
    setLoading(false)
  }, [fetchStats, fetchSales])

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchStats()
    }
  }, [authStatus, fetchStats])

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchSales()
      setLoading(false)
    }
  }, [authStatus, fetchSales])

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-4">
        <ThemeLogo className="h-10 w-auto" />
      </div>
      <nav className="flex-1 space-y-1 mt-4">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </Link>
        <Link href="/sales" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-medium text-sm">
          <ShoppingCart className="h-4 w-4" /> Vendas
        </Link>
        <Link href="/reports" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <FileBarChart className="h-4 w-4" />
          Relatórios
        </Link>
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <Settings className="h-4 w-4" /> Configurações
        </Link>
      </nav>
      <div className="border-t pt-4 mt-4">
        <div className="px-3 mb-3">
          <p className="text-sm font-medium truncate">{session?.user?.name ?? 'Usuário'}</p>
          <p className="text-xs text-muted-foreground truncate">{session?.user?.email ?? ''}</p>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )

  const header = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">Vendas</h2>
        {stats ? (
          <Badge variant="secondary" className="font-mono text-xs">
            {stats.matriculas} matrículas
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={sendingConv}
          onClick={async () => {
            setSendingConv(true)
            try {
              const res = await fetch('/api/sales/upload-conversions', { method: 'POST' })
              const data = await res.json()
              if (!res.ok) {
                toast.error(data?.error ?? 'Erro ao enviar conversões')
                return
              }
              if (data.sent > 0) {
                toast.success(`${data.sent} conversão(ões) enviada(s) ao Google Ads`)
              } else {
                toast.info(data.message ?? 'Nenhuma conversão nova para enviar')
              }
            } catch {
              toast.error('Erro de conexão')
            } finally {
              setSendingConv(false)
            }
          }}
        >
          {sendingConv ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Enviar conversões ao Google
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams()
            if (dateFrom) params.set('dateFrom', dateFrom)
            if (dateTo) params.set('dateTo', dateTo)
            const a = document.createElement('a')
            a.href = `/api/sales/export-ac?${params.toString()}`
            a.download = ''
            document.body.appendChild(a)
            a.click()
            a.remove()
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar p/ Active Campaign
        </Button>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>
    </div>
  )

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <AppShell sidebar={sidebar} header={header}>
      <div className="space-y-6">
        <SalesUploadCard onImported={refresh} />
        <ClassificationUploadCard onImported={refresh} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Período:</span>
          <Button variant={activePeriod === 'today' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(todaySP, todaySP)}>Hoje</Button>
          <Button variant={activePeriod === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(monthStartSP, todaySP)}>Este mês</Button>
          <Button variant={activePeriod === 'lastMonth' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(lastMonthStartSP, lastMonthEndSP)}>Mês passado</Button>
          <Button variant={activePeriod === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod('', '')}>Todo o período</Button>
          <div className="flex items-center gap-1.5">
            <Input type="date" className="w-36 h-9 text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="date" className="w-36 h-9 text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          {activePeriod === 'custom' ? <Badge variant="secondary" className="text-xs">{periodLabel}</Badge> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Origem:</span>
          <Button variant={origem === '' ? 'default' : 'outline'} size="sm" onClick={() => setOrigem('')}>Geral</Button>
          <Button variant={origem === 'whatsapp' ? 'default' : 'outline'} size="sm" onClick={() => setOrigem('whatsapp')}>
            <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp (casadas)
          </Button>
          {origem === 'whatsapp' ? (
            <span className="text-xs text-muted-foreground">Apenas vendas geradas por leads capturados</span>
          ) : null}
        </div>

        <SalesStatsCards stats={stats} loading={loading} periodLabel={periodLabel} origem={origem} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SalesBreakdownCard
            title="Por curso"
            icon={<BookOpen className="h-4 w-4 text-sky-500" />}
            rows={stats?.porCurso ?? []}
            loading={loading}
          />
          <SalesBreakdownCard
            title="Por forma de pagamento"
            icon={<CreditCard className="h-4 w-4 text-emerald-500" />}
            rows={stats?.porFormaPgto ?? []}
            loading={loading}
          />
          <SalesBreakdownCard
            title="Por mídia ajustada"
            icon={<Radio className="h-4 w-4 text-violet-500" />}
            rows={stats?.porMidia ?? []}
            loading={loading}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail, curso..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Button variant={matchFilter === '' ? 'default' : 'outline'} size="sm" onClick={() => { setMatchFilter(''); setPage(1) }}>Todas</Button>
          <Button variant={matchFilter === 'matched' ? 'default' : 'outline'} size="sm" onClick={() => { setMatchFilter('matched'); setPage(1) }}>Casadas c/ lead</Button>
          <Button variant={matchFilter === 'unmatched' ? 'default' : 'outline'} size="sm" onClick={() => { setMatchFilter('unmatched'); setPage(1) }}>Sem lead</Button>
        </div>

        <SalesTable
          sales={sales}
          loading={tableLoading}
          page={page}
          total={total}
          limit={limit}
          onPageChange={setPage}
        />
      </div>
    </AppShell>
  )
}
