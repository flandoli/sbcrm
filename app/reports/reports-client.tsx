'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { AppShell } from '@/components/layouts/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { ThemeLogo } from '@/components/theme-logo'
import { LayoutDashboard, Settings, LogOut, RefreshCw, ShoppingCart, FileBarChart, Clock } from 'lucide-react'
import { AttendanceReport } from './components/attendance-report'

const REPORTS = [{ key: 'attendance', label: 'Tempo de atendimento', icon: Clock }] as const

const navLink = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm'
const navActive = 'flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-medium text-sm'

export function ReportsClient() {
  const { data: session, status: authStatus } = useSession() || {}
  const [report, setReport] = useState<string>('attendance')

  const todaySP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const monthStartSP = todaySP.slice(0, 7) + '-01'
  const [ty, tm] = todaySP.split('-').map(Number)
  const pmYear = tm === 1 ? ty - 1 : ty
  const pmMonth = tm === 1 ? 12 : tm - 1
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const lastMonthStartSP = `${pmYear}-${pad2(pmMonth)}-01`
  const lastMonthEndSP = `${pmYear}-${pad2(pmMonth)}-${pad2(new Date(pmYear, pmMonth, 0).getDate())}`

  const [dateFrom, setDateFrom] = useState(monthStartSP)
  const [dateTo, setDateTo] = useState(todaySP)
  const setPeriod = (f: string, t: string) => { setDateFrom(f); setDateTo(t) }
  const active =
    !dateFrom && !dateTo ? 'all'
    : dateFrom === todaySP && dateTo === todaySP ? 'today'
    : dateFrom === monthStartSP && dateTo === todaySP ? 'month'
    : dateFrom === lastMonthStartSP && dateTo === lastMonthEndSP ? 'lastMonth'
    : 'custom'

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-4">
        <ThemeLogo className="h-10 w-auto" />
      </div>
      <nav className="flex-1 space-y-1 mt-4">
        <Link href="/dashboard" className={navLink}><LayoutDashboard className="h-4 w-4" />Dashboard</Link>
        <Link href="/sales" className={navLink}><ShoppingCart className="h-4 w-4" />Vendas</Link>
        <Link href="/reports" className={navActive}><FileBarChart className="h-4 w-4" />Relatórios</Link>
        <Link href="/settings" className={navLink}><Settings className="h-4 w-4" />Configurações</Link>
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
    <div className="flex items-center gap-2">
      <h2 className="font-display text-lg font-semibold tracking-tight">Relatórios</h2>
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
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <Button key={r.key} variant={report === r.key ? 'default' : 'outline'} size="sm" onClick={() => setReport(r.key)} className="gap-2">
              <r.icon className="h-4 w-4" />
              {r.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Período:</span>
          <Button variant={active === 'today' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(todaySP, todaySP)}>Hoje</Button>
          <Button variant={active === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(monthStartSP, todaySP)}>Este mês</Button>
          <Button variant={active === 'lastMonth' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(lastMonthStartSP, lastMonthEndSP)}>Mês passado</Button>
          <Button variant={active === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod('', '')}>Todo o período</Button>
          <div className="flex items-center gap-1 ml-1">
            <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)} className="h-9 w-[150px]" aria-label="Data inicial" />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)} className="h-9 w-[150px]" aria-label="Data final" />
          </div>
          {active === 'custom' ? <Badge variant="secondary" className="text-xs">Personalizado</Badge> : null}
        </div>

        {report === 'attendance' ? <AttendanceReport dateFrom={dateFrom} dateTo={dateTo} /> : null}
      </div>
    </AppShell>
  )
}
