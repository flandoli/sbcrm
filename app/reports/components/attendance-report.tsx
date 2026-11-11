'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Briefcase, Moon, PhoneOff, Info, RefreshCw, Users, FileQuestion, ShieldCheck, Inbox, MessageSquare, Clock } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { toast } from 'sonner'

interface WindowStats {
  leads: number
  atendidos: number
  naoAtendidos: number
  naFila: number
  assumidoSemHorario: number
  mediaSeg: number | null
  medianaSeg: number | null
  buckets: { key: string; label: string; count: number }[]
}
interface OpenState { total: number; naFila: number; aguardandoAtendente: number; aguardandoCliente: number; semStatus: number }
interface TimePair { mediaSeg: number | null; medianaSeg: number | null }
interface GroupRow { group: string; label: string; leads: number; atendidos: number; naoAtendidos: number; semRegistro: number; comercial: TimePair; fora: TimePair }
interface Unattended { id: string; name: string | null; phone: string; groupLabel: string; startedAt: string; comercial: boolean; status: string; encerrado: boolean }
interface Report {
  total: number
  comercial: WindowStats
  fora: WindowStats
  porGrupo: GroupRow[]
  naoAtendidos: Unattended[]
  naoAtendidosTotal: number
  assumidoSemHorarioTotal: number
  emAberto: OpenState
  semRegistro: number
  semRegistroLeadster: number
}

const GROUPS = [
  { key: '', label: 'Todos' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'etssr', label: 'ETSSR' },
  { key: 'vira', label: 'Vira Técnico' },
]

const STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo', QUALIFICADO: 'Qualificado', SEM_INTERESSE: 'Sem interesse',
  DDD_INDESEJADO: 'DDD indesejado', DDI_INDESEJADO: 'DDI indesejado', INVALIDO: 'Inválido', ALUNO: 'Aluno',
}

export function fmtDur(sec: number | null): string {
  if (sec === null) return '—'
  if (sec < 60) return `${Math.round(sec)}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })

function WindowCard({ title, subtitle, icon: Icon, tone, s }: { title: string; subtitle: string; icon: typeof Briefcase; tone: 'blue' | 'slate'; s: WindowStats }) {
  const accent = tone === 'blue' ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'text-slate-600 bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300'
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${accent}`}><Icon className="h-5 w-5" /></div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Tempo mediano</p>
            <p className="text-3xl font-bold tracking-tight font-mono">{fmtDur(s.medianaSeg)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tempo médio</p>
            <p className="text-3xl font-bold tracking-tight font-mono text-muted-foreground">{fmtDur(s.mediaSeg)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md bg-muted/60 p-2">
            <p className="text-xs text-muted-foreground">Leads</p>
            <p className="font-semibold font-mono">{s.leads}</p>
          </div>
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-2">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Atendidos</p>
            <p className="font-semibold font-mono text-emerald-700 dark:text-emerald-400">{s.atendidos} <span className="text-xs font-normal">({pct(s.atendidos, s.leads)})</span></p>
          </div>
          <div className="rounded-md bg-red-50 dark:bg-red-950/40 p-2">
            <p className="text-xs text-red-700 dark:text-red-400">Não atendidos</p>
            <p className="font-semibold font-mono text-red-700 dark:text-red-400">{s.naoAtendidos} <span className="text-xs font-normal">({pct(s.naoAtendidos, s.leads)})</span></p>
          </div>
        </div>
        {s.naFila > 0 ? <p className="text-xs text-muted-foreground">+ {s.naFila} conversa(s) aberta(s) há menos de 2h, ainda na fila.</p> : null}
        {s.assumidoSemHorario > 0 ? <p className="text-xs text-muted-foreground">+ {s.assumidoSemHorario} assumido(s) confirmado(s) na OpaSuite, sem tempo de assunção registrado (fora dos tempos acima).</p> : null}
      </CardContent>
    </Card>
  )
}

export function AttendanceReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [group, setGroup] = useState('')
  const [includeFiltered, setIncludeFiltered] = useState(false)
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (dateFrom) p.set('dateFrom', dateFrom)
      if (dateTo) p.set('dateTo', dateTo)
      if (group) p.set('group', group)
      if (includeFiltered) p.set('includeFiltered', '1')
      const res = await fetch(`/api/reports/attendance?${p.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      console.error('Erro ao carregar relatório de atendimento:', e)
      toast.error('Erro ao carregar o relatório')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, group, includeFiltered])

  useEffect(() => { load() }, [load])

  const verify = useCallback(async () => {
    setVerifying(true)
    const t = toast.loading('Conferindo na OpaSuite… isso pode levar alguns minutos.')
    try {
      const p = new URLSearchParams()
      if (dateFrom) p.set('dateFrom', dateFrom)
      if (dateTo) p.set('dateTo', dateTo)
      if (group) p.set('group', group)
      if (includeFiltered) p.set('includeFiltered', '1')
      const res = await fetch(`/api/reports/attendance/verify?${p.toString()}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const r = await res.json()
      toast.success(
        `Conferência concluída: ${r.assumidosEncontrados} de ${r.conferidos} “não atendidos” na verdade foram assumidos na OpaSuite. ${r.continuamNaoAtendidos} seguem sem atendimento.`,
        { id: t, duration: 8000 },
      )
      await load()
    } catch (e) {
      console.error('Erro ao conferir na OpaSuite:', e)
      toast.error('Erro ao conferir na OpaSuite', { id: t })
    } finally {
      setVerifying(false)
    }
  }, [dateFrom, dateTo, group, includeFiltered, load])

  const chartData = data
    ? data.comercial.buckets.map((b, i) => ({
        faixa: b.label,
        'Horário comercial': data.comercial.atendidos ? +((b.count / data.comercial.atendidos) * 100).toFixed(1) : 0,
        'Fora do horário': data.fora.atendidos ? +((data.fora.buckets[i].count / data.fora.atendidos) * 100).toFixed(1) : 0,
      }))
    : []
  const list = data ? (showAll ? data.naoAtendidos : data.naoAtendidos.slice(0, 20)) : []

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl font-semibold tracking-tight">Tempo de atendimento dos leads de anúncios</h3>
        <p className="text-sm text-muted-foreground">Monitor (Meta e Google), ETSSR e Vira Técnico. Tempo do início da conversa até ela ser atribuída a um atendente na OpaSuite.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Button key={g.key} size="sm" variant={group === g.key ? 'default' : 'outline'} onClick={() => setGroup(g.key)}>{g.label}</Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="incl-filtered" checked={includeFiltered} onCheckedChange={setIncludeFiltered} />
            <Label htmlFor="incl-filtered" className="text-sm text-muted-foreground cursor-pointer">Incluir DDD/DDI indesejado</Label>
          </div>
          <Button variant="outline" size="sm" onClick={verify} disabled={verifying || loading} className="gap-2">
            <ShieldCheck className={`h-4 w-4 ${verifying ? 'animate-pulse' : ''}`} />
            {verifying ? 'Conferindo…' : 'Conferir na OpaSuite'}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Atualizar relatório">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
      ) : !data || data.total + data.semRegistro === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum lead de anúncio no período selecionado.</CardContent></Card>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 md:grid-cols-2">
            <WindowCard title="Horário comercial" subtitle="Segunda a sexta, das 8h às 19h" icon={Briefcase} tone="blue" s={data.comercial} />
            <WindowCard title="Fora do horário" subtitle="Noites, madrugadas e fins de semana" icon={Moon} tone="slate" s={data.fora} />
          </div>

          {data.semRegistro > 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <FileQuestion className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">
                  {data.semRegistro} lead(s) sem registro na OpaSuite — fora da contagem acima
                </p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                  {data.semRegistroLeadster === data.semRegistro
                    ? 'Todos vieram do formulário/chat do site (Leadster)'
                    : `${data.semRegistroLeadster} vieram do formulário/chat do site (Leadster)`}
                  {' '}e não têm nenhum atendimento aberto na OpaSuite, então não é possível medir o atendimento deles.
                  Eles não entram nos tempos nem nos não atendidos.
                </p>
              </div>
            </div>
          ) : null}

          {data.emAberto.total > 0 ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Inbox className="h-4 w-4" />Conversas em aberto agora
                  <Badge variant="secondary" className="font-mono">{data.emAberto.total}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Situação da última sincronização com a OpaSuite — clique em “Conferir na OpaSuite” para atualizar.</p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs font-medium">Aguardando atendente</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">{data.emAberto.aguardandoAtendente}</p>
                    <p className="text-xs text-muted-foreground">o cliente respondeu e espera resposta</p>
                  </div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/60 dark:bg-sky-950/30">
                    <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs font-medium">Aguardando cliente</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold font-mono text-sky-700 dark:text-sky-300">{data.emAberto.aguardandoCliente}</p>
                    <p className="text-xs text-muted-foreground">atendente respondeu, bola com o cliente</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-medium">Na fila</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold font-mono">{data.emAberto.naFila}</p>
                    <p className="text-xs text-muted-foreground">ainda sem atendente atribuído</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileQuestion className="h-4 w-4" />
                      <span className="text-xs font-medium">Sem situação</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold font-mono">{data.emAberto.semStatus}</p>
                    <p className="text-xs text-muted-foreground">não sincronizado com a OpaSuite</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quanto tempo o lead espera</CardTitle>
              <p className="text-xs text-muted-foreground">% dos leads atendidos em cada faixa de espera</p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis dataKey="faixa" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Horário comercial" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Fora do horário" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Por origem</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Origem</th>
                    <th className="py-2 px-3 font-medium text-right">Leads</th>
                    <th className="py-2 px-3 font-medium text-right">Não atendidos</th>
                    <th className="py-2 px-3 font-medium text-right" title="Leads sem registro na OpaSuite (formulário do site) — não entram na contagem">Sem registro</th>
                    <th className="py-2 px-3 font-medium text-right">Comercial · mediana</th>
                    <th className="py-2 px-3 font-medium text-right">Comercial · média</th>
                    <th className="py-2 px-3 font-medium text-right">Fora · mediana</th>
                    <th className="py-2 pl-3 font-medium text-right">Fora · média</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porGrupo.map((g) => (
                    <tr key={g.group} className={`border-b last:border-0 ${group && group !== g.group ? 'opacity-50' : ''}`}>
                      <td className="py-2.5 pr-3 font-medium">{g.label}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{g.leads}</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className={g.naoAtendidos ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>{g.naoAtendidos}</span>
                        <span className="text-xs text-muted-foreground ml-1">({pct(g.naoAtendidos, g.leads)})</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">{g.semRegistro}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">{fmtDur(g.comercial.medianaSeg)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">{fmtDur(g.comercial.mediaSeg)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">{fmtDur(g.fora.medianaSeg)}</td>
                      <td className="py-2.5 pl-3 text-right font-mono text-muted-foreground">{fmtDur(g.fora.mediaSeg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <PhoneOff className="h-4 w-4 text-red-600" />Leads não atendidos
                <Badge variant="secondary" className="font-mono">{data.naoAtendidosTotal}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.naoAtendidos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lead sem atendimento no período. 🎉</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-3 font-medium">Chegou em</th>
                        <th className="py-2 px-3 font-medium">Nome</th>
                        <th className="py-2 px-3 font-medium">Telefone</th>
                        <th className="py-2 px-3 font-medium">Origem</th>
                        <th className="py-2 px-3 font-medium">Horário</th>
                        <th className="py-2 pl-3 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((l) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">{fmtDate(l.startedAt)}</td>
                          <td className="py-2 px-3">{l.name || <span className="text-muted-foreground">—</span>}</td>
                          <td className="py-2 px-3 font-mono text-xs"><span suppressHydrationWarning>{l.phone}</span></td>
                          <td className="py-2 px-3">{l.groupLabel}</td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className={l.comercial ? 'border-blue-300 text-blue-700 dark:text-blue-300' : 'text-muted-foreground'}>
                              {l.comercial ? 'Comercial' : 'Fora'}
                            </Badge>
                          </td>
                          <td className="py-2 pl-3 text-xs text-muted-foreground">
                            {l.encerrado ? 'Encerrado sem atendimento' : 'Sem atendente'} · {STATUS_LABEL[l.status] ?? l.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.naoAtendidos.length > 20 ? (
                    <div className="pt-3 text-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                        {showAll ? 'Mostrar menos' : `Mostrar todos (${data.naoAtendidos.length}${data.naoAtendidosTotal > data.naoAtendidos.length ? ` de ${data.naoAtendidosTotal}` : ''})`}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              O tempo é medido do início da conversa até ela ser atribuída a um atendente na OpaSuite (transferência ou distribuição), não até a primeira resposta escrita — a OpaSuite não envia esse dado. A mediana mostra o
              tempo típico; a média sobe muito com poucos casos de espera longa. O horário comercial é definido pela hora em que o lead chegou
              (feriados não são descontados). Não atendido = conversa aberta na OpaSuite que nenhum atendente assumiu; conversas abertas há menos de 2h ficam de fora, pois ainda
              podem estar na fila. Leads sem nenhum registro na OpaSuite (formulário do site) são mostrados à parte. Use “Conferir na OpaSuite” para checar em tempo real os leads marcados como não atendidos: os que já haviam sido assumidos (mas cujo evento não chegou pelo webhook) são retirados dessa lista.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
