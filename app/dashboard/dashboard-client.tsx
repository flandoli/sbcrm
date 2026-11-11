'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { AppShell } from '@/components/layouts/app-shell'
import { StatsCards } from './components/stats-cards'
import { LeadsTable } from './components/leads-table'
import { LeadFilters } from './components/lead-filters'
import { FunnelCard } from './components/funnel-card'
import { DecisionCenterCard } from './components/decision-center-card'
import { RoiSummaryCard } from './components/roi-summary-card'
import { AiEvaluationCard } from './components/ai-evaluation-card'
import { AdPerformanceCard } from './components/ad-performance-card'
import { GoogleAdsPerformance } from './components/google-ads-performance'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, LayoutDashboard, Settings, LogOut, RefreshCw, Bell, Sparkles, Users, Download, PhoneMissed, ShoppingCart, FileBarChart, Bot } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { ThemeLogo } from '@/components/theme-logo'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { toast } from 'sonner'

interface Lead {
  id: string
  phoneRaw: string
  phoneNormalized: string | null
  ddi: string | null
  ddd: string | null
  name: string | null
  campaignId: string | null
  campaignName: string | null
  messageFirst: string | null
  status: string
  opasuiteConversationId: string | null
  metaEventSent: boolean
  metaEventId: string | null
  metaEventError: string | null
  metaEventSentAt: string | null
  adId: string | null
  metaTagged?: boolean | null
  metaTagCheckedAt?: string | null
  ssrj?: boolean | null
  viraTecnico?: boolean | null
  adTitle: string | null
  adUrl: string | null
  channel: string | null
  source: string
  isAluno: boolean
  isNotAluno: boolean
  openedAt: string | null
  assumedAt: string | null
  closedAt: string | null
  vaicrmChatStatus?: string | null
  vaicrmAssigned?: boolean | null
  vaicrmStage?: string | null
  vaicrmOutcome?: string | null
  vaicrmSalesValue?: number | null
  vaicrmTags?: string | null
  createdAt: string
  updatedAt: string
}

interface Stats {
  total: number
  qualificados: number
  semInteresse: number
  dddIndesejado: number
  ddiIndesejado: number
  invalidos: number
  novos: number
  totalAll: number
  novosContatos: number
  outrosContatos: number
  derrubados: number
  fromAds: number
  fromOpasuite: number
  fromLeadster: number
  alunos: number
  metaSemEtiqueta?: number
  ssrjTotal?: number
  viraTecnicoTotal?: number
  fromVaicrm?: number
}

export function DashboardClient() {
  const { data: session, status: authStatus } = useSession() || {}
  const [leads, setLeads] = useState<Lead[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  // Data default = Hoje (fuso São Paulo) ao carregar a página.
  const initToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [filters, setFilters] = useState({ status: '', ddd: '', dateFrom: initToday, dateTo: initToday, source: '', channel: '', vaicrmStage: '', vaicrmSaleStatus: '' })
  const [leadType, setLeadType] = useState<'new' | 'other' | 'dropped'>('new')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [prevTotal, setPrevTotal] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [scanningBot, setScanningBot] = useState(false)

  // Data de hoje no fuso de São Paulo (YYYY-MM-DD)
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
    setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))
    setPage(1)
  }

  const activePeriod =
    !filters.dateFrom && !filters.dateTo
      ? 'all'
      : filters.dateFrom === todaySP && filters.dateTo === todaySP
      ? 'today'
      : filters.dateFrom === monthStartSP && filters.dateTo === todaySP
      ? 'month'
      : filters.dateFrom === lastMonthStartSP && filters.dateTo === lastMonthEndSP
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
      : filters.dateFrom && filters.dateTo
      ? `${fmtBR(filters.dateFrom)} – ${fmtBR(filters.dateTo)}`
      : filters.dateFrom
      ? `A partir de ${fmtBR(filters.dateFrom)}`
      : `Até ${fmtBR(filters.dateTo)}`

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.ddd) params.set('ddd', filters.ddd)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.source) params.set('source', filters.source)
      if (filters.channel) params.set('channel', filters.channel)
      if (filters.vaicrmStage) params.set('vaicrmStage', filters.vaicrmStage)
      if (filters.vaicrmSaleStatus) params.set('vaicrmSaleStatus', filters.vaicrmSaleStatus)
      params.set('type', leadType)
      params.set('page', String(page))
      params.set('limit', '50')

      const res = await fetch(`/api/leads?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setLeads(data?.leads ?? [])
      setTotal(data?.total ?? 0)
    } catch {}
  }, [filters, page, leadType])

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      const res = await fetch(`/api/leads/stats?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setStats(data)
      
      // Notify on new leads
      const newTotal = data?.totalAll ?? 0
      if (prevTotal > 0 && newTotal > prevTotal) {
        toast.info(`${newTotal - prevTotal} novo(s) lead(s) recebido(s)!`, { icon: '🔔' })
      }
      setPrevTotal(newTotal)
    } catch {}
  }, [prevTotal, filters.dateFrom, filters.dateTo])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchLeads(), fetchStats()])
    setRefreshing(false)
    setLoading(false)
  }, [fetchLeads, fetchStats])

  useEffect(() => {
    if (authStatus === 'authenticated') {
      refresh()
    }
  }, [authStatus, refresh])

  // Auto-refresh every 30s
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    const interval = setInterval(() => {
      fetchLeads()
      fetchStats()
    }, 30000)
    return () => clearInterval(interval)
  }, [authStatus, fetchLeads, fetchStats])

  // Sincronização automática da Vai de Vendas (VCRM) a cada 5 minutos enquanto o
  // painel estiver aberto: puxa os contatos novos e atualiza os atendimentos,
  // depois recarrega leads e estatísticas. Dispara também uma vez ao abrir.
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    const runVaiSync = async () => {
      try {
        const res = await fetch('/api/vaicrm/sync', { method: 'POST' })
        const data = await res.json().catch(() => null)
        if (!cancelled && data?.ok && ((data.created ?? 0) > 0 || (data.attendanceUpdated ?? 0) > 0 || (data.enrichmentUpdated ?? 0) > 0)) {
          fetchLeads()
          fetchStats()
        }
      } catch {
        // silencioso: a próxima rodada tenta de novo
      }
    }
    runVaiSync()
    const interval = setInterval(runVaiSync, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [authStatus, fetchLeads, fetchStats])

  async function handleQualify(leadId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/leads/${leadId}/qualify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Erro ao qualificar')
        return
      }

      if (newStatus === 'QUALIFICADO') {
        if (data?.metaResult?.success) {
          toast.success('Lead qualificado e evento enviado para a Meta!')
        } else {
          toast.warning(`Lead qualificado mas erro ao enviar para Meta: ${data?.metaResult?.error ?? 'desconhecido'}`)
        }
      } else {
        toast.success('Status atualizado')
      }

      await refresh()
    } catch {
      toast.error('Erro de conexão')
    }
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-4">
        <ThemeLogo className="h-10 w-auto" />
      </div>

      <nav className="flex-1 space-y-1 mt-4">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-medium text-sm">
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        <Link href="/sales" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <ShoppingCart className="h-4 w-4" />
          Vendas
        </Link>
        <Link href="/reports" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <FileBarChart className="h-4 w-4" />
          Relatórios
        </Link>
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <Settings className="h-4 w-4" />
          Configurações
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
        <h2 className="font-display text-lg font-semibold tracking-tight">Dashboard</h2>
        {stats ? (
          <Badge variant="secondary" className="font-mono text-xs">
            {stats.totalAll} leads
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={async () => {
            setExporting(true)
            try {
              const params = new URLSearchParams()
              if (filters.status) params.set('status', filters.status)
              if (filters.ddd) params.set('ddd', filters.ddd)
              if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
              if (filters.dateTo) params.set('dateTo', filters.dateTo)
              if (filters.source) params.set('source', filters.source)
              if (filters.channel) params.set('channel', filters.channel)
              if (filters.vaicrmStage) params.set('vaicrmStage', filters.vaicrmStage)
              if (filters.vaicrmSaleStatus) params.set('vaicrmSaleStatus', filters.vaicrmSaleStatus)
              const res = await fetch(`/api/leads/export?${params.toString()}`)
              if (!res.ok) { toast.error('Erro ao exportar'); return }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `leads.xlsx`
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
              toast.success('Exportação concluída!')
            } catch { toast.error('Erro ao exportar') } finally { setExporting(false) }
          }}
        >
          <Download className={`h-4 w-4 mr-2 ${exporting ? 'animate-spin' : ''}`} />
          Exportar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={scanningBot}
          onClick={async () => {
            setScanningBot(true)
            try {
              const res = await fetch('/api/leads/scan-bot-stuck', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: 2 }),
              })
              const data = await res.json()
              if (!res.ok) { toast.error(data?.error ?? 'Erro ao conferir'); return }
              toast.success(`${data.stuck} lead(s) parado(s) no robô (opt-in: ${data.optin}, boas-vindas: ${data.welcome})`, { icon: '🤖' })
              await refresh()
            } catch { toast.error('Erro ao conferir travados no robô') } finally { setScanningBot(false) }
          }}
        >
          <Bot className={`h-4 w-4 mr-2 ${scanningBot ? 'animate-spin' : ''}`} />
          Conferir robô
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Período:</span>
          <Button
            variant={activePeriod === 'today' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(todaySP, todaySP)}
          >
            Hoje
          </Button>
          <Button
            variant={activePeriod === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(monthStartSP, todaySP)}
          >
            Este mês
          </Button>
          <Button
            variant={activePeriod === 'lastMonth' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(lastMonthStartSP, lastMonthEndSP)}
          >
            Mês passado
          </Button>
          <Button
            variant={activePeriod === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod('', '')}
          >
            Todo o período
          </Button>
          {activePeriod === 'custom' ? (
            <Badge variant="secondary" className="text-xs">{periodLabel}</Badge>
          ) : null}
        </div>

        <StatsCards stats={stats} loading={loading} periodLabel={periodLabel} />

        <RoiSummaryCard
          dateFrom={filters.dateFrom || undefined}
          dateTo={filters.dateTo || undefined}
        />

        <AiEvaluationCard
          dateFrom={filters.dateFrom || undefined}
          dateTo={filters.dateTo || undefined}
          periodLabel={periodLabel}
        />

        <DecisionCenterCard
          dateFrom={filters.dateFrom || undefined}
          dateTo={filters.dateTo || undefined}
        />

        <FunnelCard
          dateFrom={filters.dateFrom || undefined}
          dateTo={filters.dateTo || undefined}
        />

        <AdPerformanceCard
          dateFrom={filters.dateFrom || undefined}
          dateTo={filters.dateTo || undefined}
        />

        <GoogleAdsPerformance
          dateFrom={filters.dateFrom || undefined}
          dateTo={filters.dateTo || undefined}
        />

        <Tabs value={leadType} onValueChange={(v: string) => { setLeadType(v as 'new' | 'other' | 'dropped'); setPage(1) }}>
          <TabsList>
            <TabsTrigger value="new" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Novos contatos
              {stats ? <Badge variant="secondary" className="ml-1 font-mono text-xs">{stats.novosContatos}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="other" className="gap-2">
              <Users className="h-4 w-4" />
              Outros contatos
              {stats ? <Badge variant="secondary" className="ml-1 font-mono text-xs">{stats.outrosContatos}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="dropped" className="gap-2">
              <PhoneMissed className="h-4 w-4" />
              Derrubados
              {stats ? <Badge variant="secondary" className="ml-1 font-mono text-xs">{stats.derrubados ?? 0}</Badge> : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <p className="text-sm text-muted-foreground -mt-2">
          {leadType === 'new'
            ? 'Contatos de novas conversas — potenciais leads vindos dos anúncios.'
            : leadType === 'other'
            ? 'Contatos de movimentações de atendimentos existentes (transferências, encerramentos) e alunos já identificados.'
            : 'Contatos que iniciaram a conversa mas ficaram inativos (~3h) e foram encerrados sem continuidade.'}
        </p>

        <LeadFilters filters={filters} onFilterChange={(f: any) => { setFilters(f); setPage(1) }} />
        <LeadsTable
          leads={leads}
          loading={loading}
          onQualify={handleQualify}
          page={page}
          total={total}
          onPageChange={setPage}
        />
      </div>
    </AppShell>
  )
}
