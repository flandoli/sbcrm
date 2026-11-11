'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown, CheckCircle2, MinusCircle, MapPin, Globe, Ban, RotateCcw, Send, ChevronLeft, ChevronRight, Megaphone, AlertTriangle } from 'lucide-react'
import { maskPhone } from '@/lib/phone-utils'
import { channelLabel, channelColor } from '@/lib/channel-utils'
import { isUntaggedMeta } from '@/lib/meta-tag-utils'

interface Lead {
  id: string
  phoneRaw: string
  phoneNormalized: string | null
  ddi: string | null
  ddd: string | null
  name: string | null
  campaignName: string | null
  status: string
  metaEventSent: boolean
  adId: string | null
  adTitle: string | null
  adUrl: string | null
  channel: string | null
  metaTagged?: boolean | null
  metaTagCheckedAt?: string | null
  ssrj?: boolean | null
  viraTecnico?: boolean | null
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
  opaStatus?: string | null
  waitingOn?: string | null
  lastMessageAt?: string | null
  botStuck?: boolean | null
  botStuckStage?: string | null
  botStuckClientMsgs?: number | null
  createdAt: string
}

interface WaitInfo {
  opaStatus: string | null
  waitingOn: string | null
  lastMessageAt: string | null
  closedAt: string | null
  botStuck?: boolean | null
  botStuckStage?: string | null
  botStuckClientMsgs?: number | null
}

function BotStuckBadge({ stage, clientMsgs }: { stage?: string | null; clientMsgs?: number | null }) {
  const isOptin = stage === 'optin'
  const label = isOptin ? '🤖 Parado no robô · opt-in' : '🤖 Parado no robô · boas-vindas'
  const title = isOptin
    ? 'O cliente não respondeu nenhuma mensagem do fluxo automático (parou logo no início / opt-in). Etapa inferida pelo engajamento — os textos dos portões do bot não ficam disponíveis na API.'
    : `O cliente respondeu apenas ${clientMsgs ?? 1} vez e parou no fluxo automático (provável etapa de boas-vindas). Etapa inferida pelo engajamento — os textos dos portões do bot não ficam disponíveis na API.`
  return (
    <Badge variant="outline" className="border-rose-500/60 text-rose-300 bg-rose-500/10 text-xs gap-1" title={title}>
      {label}
    </Badge>
  )
}

function WaitingBadge({ waitingOn, lastMessageAt, queued }: { waitingOn: string | null | undefined; lastMessageAt?: string | null; queued?: boolean }) {
  const since = lastMessageAt ? `\nÚltima mensagem: ${formatDate(lastMessageAt)}` : ''
  if (waitingOn === 'cliente') return (
    <span className="text-sky-400" title={`Aguardando o CLIENTE responder (última mensagem foi do atendente)${since}`}>💬 Aguard. cliente</span>
  )
  if (waitingOn === 'atendente') return (
    <span className="text-amber-400" title={queued ? `Na fila: aguardando um atendente ASSUMIR${since}` : `Aguardando o ATENDENTE responder (última mensagem foi do cliente)${since}`}>
      ⏳ Aguard. atendente
    </span>
  )
  return null
}

const statusConfig: Record<string, { label: string; emoji: string; variant: string; className: string }> = {
  NOVO: { label: 'Novo', emoji: '🟡', variant: 'outline', className: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10' },
  QUALIFICADO: { label: 'Qualificado', emoji: '✅', variant: 'outline', className: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' },
  SEM_INTERESSE: { label: 'Sem Interesse', emoji: '😐', variant: 'outline', className: 'border-gray-500/50 text-gray-400 bg-gray-500/10' },
  DDD_INDESEJADO: { label: 'DDD Indesejado', emoji: '📍', variant: 'outline', className: 'border-orange-500/50 text-orange-400 bg-orange-500/10' },
  DDI_INDESEJADO: { label: 'DDI Indesejado', emoji: '🌍', variant: 'outline', className: 'border-red-500/50 text-red-400 bg-red-500/10' },
  INVALIDO: { label: 'Inválido', emoji: '🚫', variant: 'outline', className: 'border-red-700/50 text-red-600 bg-red-700/10' },
  ALUNO: { label: 'Aluno', emoji: '🎓', variant: 'outline', className: 'border-blue-500/50 text-blue-400 bg-blue-500/10' },
}

// Cores por etapa do funil Kanban CRM da Vai de Vendas.
const stageConfig: Record<string, string> = {
  'Apresentação': 'border-cyan-500/50 text-cyan-300 bg-cyan-500/10',
  'Analisando': 'border-teal-500/50 text-teal-300 bg-teal-500/10',
  'Negociação': 'border-amber-500/50 text-amber-300 bg-amber-500/10',
  'Matrícula': 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10',
  'Perda': 'border-red-500/50 text-red-300 bg-red-500/10',
}

function StageBadge({ stage }: { stage?: string | null }) {
  if (!stage) return <span className="text-muted-foreground">—</span>
  const cls = stageConfig[stage] ?? 'border-gray-500/50 text-gray-300 bg-gray-500/10'
  return <Badge variant="outline" className={`${cls} text-xs`} title={`Etapa no funil Kanban CRM: ${stage}`}>{stage}</Badge>
}

// Mapeamento das tags de venda do VCRM para rótulos de "Situação de venda".
const saleTagConfig: Record<string, { label: string; cls: string; title: string }> = {
  'matrícula': { label: '🎓 Matrícula', cls: 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10', title: 'Venda — fechamento (tag "Matrícula" no VCRM)' },
  'pós-matrícula': { label: '📘 Pós-matrícula', cls: 'border-green-500/60 text-green-300 bg-green-500/10', title: 'Venda — pós-fechamento (tag "Pós-matrícula" no VCRM)' },
  'lead quente': { label: '🔥 Lead Quente', cls: 'border-amber-500/60 text-amber-300 bg-amber-500/10', title: 'Qualificação (tag "Lead Quente" no VCRM)' },
  'curso técnico': { label: '🔧 Curso Técnico', cls: 'border-sky-500/60 text-sky-300 bg-sky-500/10', title: 'Interesse de produto (tag "Curso Técnico" no VCRM)' },
}

function SaleStatusCell({ tagsJson }: { tagsJson?: string | null }) {
  let tags: string[] = []
  if (tagsJson) { try { const a = JSON.parse(tagsJson); if (Array.isArray(a)) tags = a.filter((t) => typeof t === 'string') } catch {} }
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>
  // Ordena: tags de venda mapeadas primeiro, demais tags depois.
  const mapped = tags.filter((t) => saleTagConfig[t.trim().toLowerCase()])
  const others = tags.filter((t) => !saleTagConfig[t.trim().toLowerCase()])
  return (
    <div className="flex flex-col items-start gap-1">
      {mapped.map((t) => {
        const c = saleTagConfig[t.trim().toLowerCase()]
        return <Badge key={t} variant="outline" className={`${c.cls} text-xs`} title={c.title}>{c.label}</Badge>
      })}
      {others.map((t) => (
        <Badge key={t} variant="outline" className="border-gray-500/40 text-gray-400 bg-gray-500/10 text-xs" title={`Tag no VCRM: ${t}`}>{t}</Badge>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, emoji: '❓', variant: 'outline', className: '' }
  return (
    <Badge variant="outline" className={`${config.className} text-xs`}>
      {config.emoji} {config.label}
    </Badge>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  } catch {
    return iso ?? ''
  }
}

function fmtMs(ms: number): string {
  if (ms < 0 || isNaN(ms)) return '—'
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatDuration(a: string | null, b: string | null): string {
  if (!a || !b) return '—'
  return fmtMs(new Date(b).getTime() - new Date(a).getTime())
}

export function LeadsTable({
  leads,
  loading,
  onQualify,
  page,
  total,
  onPageChange,
}: {
  leads: Lead[]
  loading: boolean
  onQualify: (id: string, status: string) => void
  page: number
  total: number
  onPageChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / 50))
  const [waitMap, setWaitMap] = useState<Record<string, WaitInfo>>({})

  // Consulta na OpaSuite quem está aguardando (cliente x atendente) para os
  // leads em aberto da página atual.
  useEffect(() => {
    const ids = (leads ?? []).filter((l) => l?.source !== 'vaivendas' && l?.openedAt && !l?.closedAt).map((l) => l.id)
    if (loading || ids.length === 0) return
    let cancelled = false
    fetch('/api/leads/wait-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return
        const next: Record<string, WaitInfo> = {}
        for (const s of d?.states ?? []) next[s.id] = s
        setWaitMap((prev) => ({ ...prev, ...next }))
      })
      .catch((e) => console.error('[LeadsTable] falha ao consultar status de espera:', e))
    return () => { cancelled = true }
  }, [leads, loading])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i: number) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    )
  }

  if ((leads?.length ?? 0) === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">Nenhum lead encontrado</p>
        <p className="text-sm mt-1">Leads aparecerão aqui quando chegarem pelo webhook</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-sm font-semibold text-foreground">Nome</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Telefone</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">DDD</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Status</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Fonte</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Canal</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Etapa</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Situação de venda</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Anúncio</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Espera</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Atend.</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Recebido</TableHead>
              <TableHead className="text-sm font-semibold text-foreground">Meta</TableHead>
              <TableHead className="text-sm font-semibold text-foreground text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(leads ?? []).map((lead: Lead) => (
              <TableRow
                key={lead.id}
                className={`hover:bg-accent/50 transition-colors ${
                  isUntaggedMeta(lead) ? 'bg-amber-500/[0.07] border-l-2 border-l-amber-500' : ''
                }`}
              >
                <TableCell className="text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className={lead?.isNotAluno ? 'text-green-400 font-semibold' : ''}>{lead?.name ?? '—'}</span>
                    {lead?.isAluno && (
                      <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-500/10 text-xs px-1.5 py-0">
                        🎓 Aluno
                      </Badge>
                    )}
                    {lead?.isNotAluno && (
                      <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10 text-xs px-1.5 py-0">
                        ✅ Não é aluno
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-sm font-mono">{maskPhone(lead?.phoneNormalized ?? lead?.phoneRaw)}</TableCell>
                <TableCell className="text-sm font-mono">{lead?.ddd ?? '—'}</TableCell>
                <TableCell><StatusBadge status={lead?.status ?? 'NOVO'} /></TableCell>
                <TableCell className="text-xs">
                  {lead?.source === 'leadster' ? (
                    <Badge variant="outline" className="border-violet-500/50 text-violet-400 bg-violet-500/10 text-xs">
                      🤖 Leadster
                    </Badge>
                  ) : lead?.source === 'vaivendas' ? (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 text-xs">
                      📞 VCRM
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-sky-500/50 text-sky-400 bg-sky-500/10 text-xs">
                      💬 OpaSuite
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-col items-start gap-1">
                    {(() => {
                      const ch = lead?.channel
                      const colors = channelColor(ch)
                      return (
                        <Badge variant="outline" className={`${colors.bg} ${colors.text} border-current/30 text-xs`}>
                          {ch === 'pago_meta' ? '📘' : ch === 'pago_google' ? '🔍' : ch === 'pago_outro' ? '💰' : ch === 'organico' ? '🌱' : ch === 'direto' ? '🔗' : ch === 'http' ? '🌐' : '❓'}{' '}
                          {channelLabel(ch)}
                        </Badge>
                      )
                    })()}
                    {isUntaggedMeta(lead) && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/60 text-amber-400 bg-amber-500/10 text-xs gap-1"
                        title="Veio de anúncio da Meta (dados do anúncio presentes), mas a OpaSuite não aplicou a etiqueta Meta"
                      >
                        <AlertTriangle className="h-3 w-3" /> Meta s/ etiqueta
                      </Badge>
                    )}
                    {lead?.ssrj && (
                      <Badge
                        variant="outline"
                        className="border-purple-500/60 text-purple-300 bg-purple-500/10 text-xs"
                        title="Lead veio de uma campanha de outra conta de Instagram (etiqueta SSRJ na OpaSuite)"
                      >
                        🟣 SSRJ
                      </Badge>
                    )}
                    {lead?.viraTecnico && (
                      <Badge
                        variant="outline"
                        className="border-teal-500/60 text-teal-300 bg-teal-500/10 text-xs gap-1"
                        title="Lead da página &quot;viratecnico&quot; e/ou da linha de WhatsApp 11 94577-7262"
                      >
                        🔧 Vira Técnico
                      </Badge>
                    )}
                    {(() => {
                      const w = waitMap[lead.id]
                      const stuck = w ? w.botStuck : lead?.botStuck
                      if (!stuck) return null
                      const stage = w?.botStuckStage ?? lead?.botStuckStage
                      const cliMsgs = w?.botStuckClientMsgs ?? lead?.botStuckClientMsgs
                      return <BotStuckBadge stage={stage} clientMsgs={cliMsgs} />
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <StageBadge stage={lead?.vaicrmStage} />
                </TableCell>
                <TableCell className="text-xs">
                  <SaleStatusCell tagsJson={lead?.vaicrmTags} />
                </TableCell>
                <TableCell className="text-sm">
                  {lead?.adTitle ? (
                    <div className="flex items-center gap-1.5">
                      <Megaphone className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      {lead.adUrl ? (
                        <a href={lead.adUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 hover:underline truncate max-w-[160px]" title={lead.adTitle}>
                          {lead.adTitle}
                        </a>
                      ) : (
                        <span className="truncate max-w-[160px] text-muted-foreground" title={lead.adTitle}>{lead.adTitle}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {(() => {
                  const w = waitMap[lead.id]
                  const closedAt = lead?.closedAt ?? w?.closedAt ?? null
                  const opaStatus = w?.opaStatus ?? lead?.opaStatus ?? null
                  const waitingOn = w ? w.waitingOn : lead?.waitingOn ?? null
                  const lastMessageAt = w?.lastMessageAt ?? lead?.lastMessageAt ?? null
                  const isOpen = !!lead?.openedAt && !closedAt
                  const queued = opaStatus === 'AG'
                  // assumedAt válido = existe E é anterior ao closedAt (se houver)
                  const validAssumedWait = lead?.assumedAt && lead?.openedAt &&
                    (!closedAt || new Date(lead.assumedAt).getTime() <= new Date(closedAt).getTime())
                  const validAssumed = lead?.assumedAt && closedAt &&
                    new Date(lead.assumedAt).getTime() <= new Date(closedAt).getTime()
                  return (
                    <>
                <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap" suppressHydrationWarning>
                  {(() => {
                    if (lead?.source === 'vaivendas') {
                      if (lead.vaicrmAssigned) return (
                        <span className="text-emerald-400" title="Atendimento assumido por um atendente na Vai de Vendas">✓ Assumido</span>
                      )
                      if (closedAt) return (
                        <span title={`Encerrado: ${formatDate(closedAt)}`}>✓ Encerrado</span>
                      )
                      return (
                        <span className="text-yellow-400" title="Ainda na fila da Vai de Vendas — ninguém assumiu">⏳ Sem assunção</span>
                      )
                    }
                    if (validAssumedWait) return (
                      <span title={`Abertura: ${formatDate(lead.openedAt!)}\nAssumido: ${formatDate(lead.assumedAt!)}`}>
                        ⏳ {formatDuration(lead.openedAt!, lead.assumedAt!)}
                      </span>
                    )
                    if (isOpen && queued) return <WaitingBadge waitingOn="atendente" lastMessageAt={lastMessageAt} queued />
                    if (isOpen && opaStatus && opaStatus !== 'AG') return (
                      <span title={`Abertura: ${formatDate(lead.openedAt!)}\nJá assumido por um atendente (horário da assunção não registrado)`}>✓ Assumido</span>
                    )
                    if (isOpen) return (
                      <span className="text-yellow-400" title={`Abertura: ${formatDate(lead.openedAt!)}\nSem assunção registrada`}>⏳ Sem assunção</span>
                    )
                    return <span>—</span>
                  })()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap" suppressHydrationWarning>
                  {(() => {
                    if (lead?.source === 'vaivendas') {
                      if (closedAt && lead.openedAt) return (
                        <span title={`Abertura: ${formatDate(lead.openedAt)}\nEncerramento: ${formatDate(closedAt)}`}>
                          ⏱ {formatDuration(lead.openedAt, closedAt)}
                        </span>
                      )
                      if (lead.vaicrmAssigned) return (
                        <span className="text-emerald-400" title="Em atendimento na Vai de Vendas">💬 Em atendimento</span>
                      )
                      return <span>—</span>
                    }
                    if (isOpen && queued) return <span title="Conversa ainda na fila da Opa — ninguém assumiu">Na fila</span>
                    if (isOpen && waitingOn) return <WaitingBadge waitingOn={waitingOn} lastMessageAt={lastMessageAt} />
                    if (validAssumed) return (
                      <span title={`Assumido: ${formatDate(lead.assumedAt!)}\nEncerramento: ${formatDate(closedAt!)}`}>
                        ⏱ {formatDuration(lead.assumedAt!, closedAt)}
                      </span>
                    )
                    if (lead?.openedAt && closedAt) return (
                      <span title={`Abertura: ${formatDate(lead.openedAt)}\nEncerramento: ${formatDate(closedAt)}\n(sem dado de assunção)`}>
                        ⏱ {formatDuration(lead.openedAt, closedAt)}
                      </span>
                    )
                    if (isOpen) return (
                      <span className="text-yellow-400" title={`Abertura: ${formatDate(lead.openedAt!)}\nEm atendimento (consultando quem está aguardando…)`}>⏳ Aberto</span>
                    )
                    return <span>—</span>
                  })()}
                </TableCell>
                    </>
                  )
                })()}
                <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>{formatDate(lead?.createdAt)}</TableCell>
                <TableCell>
                  {lead?.isAluno ? (
                    <span className="text-xs text-muted-foreground" title="Aluno não é contabilizado como conversão Meta">—</span>
                  ) : lead?.metaEventSent ? (
                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/10 text-xs">
                      <Send className="h-3 w-3 mr-1" /> Enviado
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        Qualificar <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onQualify(lead.id, 'QUALIFICADO')}>
                        <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" /> Qualificado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onQualify(lead.id, 'SEM_INTERESSE')}>
                        <MinusCircle className="h-4 w-4 mr-2 text-gray-400" /> Sem Interesse
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onQualify(lead.id, 'DDD_INDESEJADO')}>
                        <MapPin className="h-4 w-4 mr-2 text-orange-400" /> DDD Indesejado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onQualify(lead.id, 'DDI_INDESEJADO')}>
                        <Globe className="h-4 w-4 mr-2 text-red-400" /> DDI Indesejado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onQualify(lead.id, 'INVALIDO')}>
                        <Ban className="h-4 w-4 mr-2 text-red-600" /> Inválido
                      </DropdownMenuItem>
                      {lead.status !== 'NOVO' && (
                        <DropdownMenuItem onClick={() => onQualify(lead.id, 'NOVO')}>
                          <RotateCcw className="h-4 w-4 mr-2 text-yellow-400" /> Voltar para Novo
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} lead{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
