'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, Loader2, MessageSquare, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Empty, SEGMENTO_LABEL } from '../admin/ui'
import type { ContaBase } from './contas-client'

interface Etapa { id: string; nome: string; ordem: number; terminal: boolean; resultado: 'FECHADO' | 'PERDIDO' | null }
interface Cartao extends ContaBase {
  opportunityId: string | null
  stageId: string | null
  semOportunidade: boolean
  motivoPerda: string | null
  _count: { pessoas: number; notas: number }
}
interface Quadro {
  stages: Etapa[]
  transicoes: { livre: boolean; permitidas: { fromStageId: string; toStageId: string }[] }
  contas: Cartao[]
  totalProvisorio: number
  podeVerTodas: boolean
  responsaveis: { id: string; name: string | null; email: string }[]
}
export type QuadroMeta = Pick<Quadro, 'totalProvisorio' | 'podeVerTodas' | 'responsaveis'>

interface Props {
  filtros: string
  versao: number
  onCnpj: (c: ContaBase) => void
  onMeta: (m: QuadroMeta) => void
}

export function ContasKanban({ filtros, versao, onCnpj, onMeta }: Props) {
  const [quadro, setQuadro] = useState<Quadro | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [arrastando, setArrastando] = useState<Cartao | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [perda, setPerda] = useState<{ conta: Cartao; etapa: Etapa } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [aberto, setAberto] = useState<Cartao | null>(null)
  const metaRef = useRef(onMeta)
  metaRef.current = onMeta

  const carregar = useCallback(async () => {
    setCarregando(true)
    const res = await fetch(`/api/contas/quadro?${filtros}`)
    const data = await res.json().catch(() => ({}))
    setCarregando(false)
    if (!res.ok) return toast.error(data?.error ?? `Erro ${res.status}`)
    setQuadro(data)
    metaRef.current({ totalProvisorio: data.totalProvisorio, podeVerTodas: data.podeVerTodas, responsaveis: data.responsaveis })
  }, [filtros])
  useEffect(() => {
    carregar()
  }, [carregar, versao])

  const etapa = (id: string | null) => quadro?.stages.find((s) => s.id === id) ?? null

  /** Regra do grafo no cliente (o servidor valida de novo). */
  function permitido(c: Cartao, destino: string) {
    if (!quadro || c.stageId === destino) return false
    if (c.semOportunidade || quadro.transicoes.livre) return true
    return quadro.transicoes.permitidas.some((t) => t.fromStageId === c.stageId && t.toStageId === destino)
  }

  function avisoCnpj(c: Cartao, msg: string) {
    toast.error(msg, { action: { label: 'Informar CNPJ real', onClick: () => onCnpj(c) }, duration: 8000 })
  }

  function solicitarMover(c: Cartao, destinoId: string) {
    const destino = etapa(destinoId)
    if (!destino || c.stageId === destinoId) return
    if (!permitido(c, destinoId))
      return toast.error(`Movimento não permitido: de "${etapa(c.stageId)?.nome}" para "${destino.nome}" não está liberado no funil.`)
    if (destino.resultado === 'FECHADO' && c.cnpjProvisorio)
      return avisoCnpj(c, 'Conta com CNPJ provisório não pode ir para Fechamento. Informe o CNPJ real primeiro.')
    if (destino.resultado === 'PERDIDO') {
      setMotivo('')
      return setPerda({ conta: c, etapa: destino })
    }
    executar(c, destino)
  }

  async function executar(c: Cartao, destino: Etapa, motivoPerda?: string) {
    const anterior = { stageId: c.stageId, semOportunidade: c.semOportunidade, motivoPerda: c.motivoPerda }
    const patch = (dados: Partial<Cartao>) =>
      setQuadro((q) => (q ? { ...q, contas: q.contas.map((x) => (x.id === c.id ? { ...x, ...dados } : x)) } : q))
    patch({ stageId: destino.id, semOportunidade: false, motivoPerda: motivoPerda ?? null }) // otimista
    const res = await fetch(`/api/contas/${c.id}/etapa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStageId: destino.id, motivo: motivoPerda, fromStageId: c.semOportunidade ? null : c.stageId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      patch(anterior) // reverte
      if (data?.code === 'CNPJ_PROVISORIO') return avisoCnpj(c, data.error)
      toast.error(data?.error ?? `Erro ${res.status}`)
      if (data?.code === 'CONFLITO') carregar()
      return
    }
    patch({ opportunityId: data.opportunityId })
    toast.success(`${nomeConta(c)} → ${destino.nome}`)
  }

  if (!quadro) return carregando ? <Carregando /> : <Empty>Não foi possível carregar o quadro.</Empty>
  if (!quadro.stages.length) return <Empty>Nenhuma etapa ativa no funil. Configure em Admin → Funil.</Empty>

  return (
    <>
      <div className="relative">
        {carregando && <Loader2 className="absolute -top-8 right-0 h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:snap-none md:px-0">
          {quadro.stages.map((s) => {
            const cartoes = quadro.contas.filter((c) => c.stageId === s.id)
            const alvo = arrastando && arrastando.stageId !== s.id
            const ok = alvo && permitido(arrastando, s.id)
            return (
              <section
                key={s.id}
                aria-label={s.nome}
                className={cn(
                  'flex w-[85vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-lg border bg-muted/40 sm:w-72',
                  alvo && ok && 'border-primary/60',
                  alvo && !ok && 'opacity-50',
                  sobre === s.id && ok && 'bg-primary/10',
                )}
                onDragOver={(e) => {
                  if (!arrastando) return
                  e.preventDefault()
                  // Sempre aceita o drop: movimento proibido é recusado em solicitarMover com mensagem
                  // (com dropEffect 'none' o navegador descartaria o drop em silêncio).
                  e.dataTransfer.dropEffect = 'move'
                  if (sobre !== s.id) setSobre(s.id)
                }}
                onDragLeave={() => setSobre((v) => (v === s.id ? null : v))}
                onDrop={(e) => {
                  e.preventDefault()
                  setSobre(null)
                  const c = quadro.contas.find((x) => x.id === e.dataTransfer.getData('text/plain'))
                  setArrastando(null)
                  if (c) solicitarMover(c, s.id)
                }}
              >
                <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <h2 className={cn('text-sm font-semibold', s.resultado === 'FECHADO' && 'text-emerald-600', s.resultado === 'PERDIDO' && 'text-destructive')}>
                    {s.nome}
                  </h2>
                  <Badge variant="secondary" aria-label={`${cartoes.length} contas`}>{cartoes.length}</Badge>
                </header>
                <div className="flex max-h-[68vh] min-h-[6rem] flex-col gap-2 overflow-y-auto p-2">
                  {!cartoes.length && <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma conta</p>}
                  {cartoes.map((c) => (
                    <CartaoConta
                      key={c.id}
                      conta={c}
                      etapas={quadro.stages}
                      permitido={(d) => permitido(c, d)}
                      onMover={(d) => solicitarMover(c, d)}
                      onAbrir={() => setAberto(c)}
                      onDragStart={() => setArrastando(c)}
                      onDragEnd={() => {
                        setArrastando(null)
                        setSobre(null)
                      }}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <Dialog open={!!perda} onOpenChange={(o) => !o && setPerda(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover para {perda?.etapa.nome}</DialogTitle>
            <DialogDescription>{perda && nomeConta(perda.conta)} — o motivo é obrigatório e fica no histórico.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo da perda</Label>
            <Textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: optou por concorrente, sem orçamento em 2026…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerda(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim()}
              onClick={() => {
                if (!perda) return
                executar(perda.conta, perda.etapa, motivo.trim())
                setPerda(null)
              }}
            >
              Confirmar perda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResumoConta
        conta={aberto ? quadro.contas.find((c) => c.id === aberto.id) ?? aberto : null}
        etapa={aberto ? etapa(quadro.contas.find((c) => c.id === aberto.id)?.stageId ?? null) : null}
        onClose={() => setAberto(null)}
        onCnpj={(c) => {
          setAberto(null)
          onCnpj(c)
        }}
      />
    </>
  )
}

const nomeConta = (c: ContaBase) => c.nomeFantasia || c.razaoSocial

function Carregando() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando quadro…
    </div>
  )
}

function CartaoConta({
  conta: c, etapas, permitido, onMover, onAbrir, onDragStart, onDragEnd,
}: {
  conta: Cartao
  etapas: Etapa[]
  permitido: (destino: string) => boolean
  onMover: (destino: string) => void
  onAbrir: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', c.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className="cursor-grab rounded-md border bg-card p-3 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onAbrir} className="min-w-0 text-left font-medium leading-tight hover:underline">
          <span className="line-clamp-2">{nomeConta(c)}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="-mr-1 -mt-1 h-8 w-8 shrink-0" aria-label="Mover para…">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mover para…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {etapas
              .filter((s) => s.id !== c.stageId)
              .map((s) => (
                <DropdownMenuItem key={s.id} disabled={!permitido(s.id)} onSelect={() => onMover(s.id)}>
                  {s.nome}
                  {s.resultado === 'FECHADO' && c.cnpjProvisorio && <span className="ml-auto pl-3 text-xs text-amber-600">CNPJ real</span>}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="secondary">{SEGMENTO_LABEL[c.segmento] ?? c.segmento}</Badge>
        <Badge variant={c.statusConta === 'CLIENTE' ? 'default' : 'outline'}>{c.statusConta === 'CLIENTE' ? 'Cliente' : 'Prospect'}</Badge>
        {c.cnpjProvisorio && <Badge variant="outline" className="border-amber-500 text-amber-600">CNPJ provisório</Badge>}
        {c.semOportunidade && <Badge variant="outline">Sem oportunidade</Badge>}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p className="truncate">{c.responsavel.name ?? c.responsavel.email}</p>
        {c.origem && <p className="truncate">Origem: {c.origem.nome}</p>}
        {c.motivoPerda && <p className="line-clamp-2 text-destructive">Motivo: {c.motivoPerda}</p>}
        <p className="flex items-center gap-3 pt-1">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c._count.pessoas}</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {c._count.notas}</span>
        </p>
      </div>
    </article>
  )
}

interface Resumo {
  pessoas: { papel: string; principal: boolean; person: { nome: string; cargo: string | null; email: string | null; telefone: string } }[]
  notas: { id: string; texto: string; createdAt: string }[]
  historico: { createdAt: string; fromStage: { nome: string } | null; toStage: { nome: string }; user: { name: string | null; email: string } }[]
}

const dataBr = (s: string) => new Date(s).toLocaleDateString('pt-BR')

function ResumoConta({ conta, etapa, onClose, onCnpj }: { conta: Cartao | null; etapa: Etapa | null; onClose: () => void; onCnpj: (c: Cartao) => void }) {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const id = conta?.id
  const stageId = conta?.stageId
  useEffect(() => {
    setResumo(null)
    if (!id) return
    fetch(`/api/contas/${id}/resumo`).then(async (r) => r.ok && setResumo(await r.json()))
  }, [id, stageId])

  return (
    <Sheet open={!!conta} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {conta && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{nomeConta(conta)}</SheetTitle>
              <SheetDescription>
                {conta.razaoSocial !== nomeConta(conta) && <>{conta.razaoSocial} · </>}
                <span className="font-mono">{conta.cnpj}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-5 text-sm">
              <div className="flex flex-wrap gap-1">
                {etapa && <Badge>{etapa.nome}</Badge>}
                <Badge variant="secondary">{SEGMENTO_LABEL[conta.segmento] ?? conta.segmento}</Badge>
                <Badge variant="outline">{conta.statusConta === 'CLIENTE' ? 'Cliente' : 'Prospect'}</Badge>
                {conta.cnpjProvisorio && <Badge variant="outline" className="border-amber-500 text-amber-600">CNPJ provisório</Badge>}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Responsável</dt>
                <dd>{conta.responsavel.name ?? conta.responsavel.email}</dd>
                <dt className="text-muted-foreground">Origem</dt>
                <dd>{conta.origem?.nome ?? '—'}</dd>
                {conta.motivoPerda && (
                  <>
                    <dt className="text-muted-foreground">Motivo da perda</dt>
                    <dd>{conta.motivoPerda}</dd>
                  </>
                )}
              </dl>
              <Button size="sm" variant={conta.cnpjProvisorio ? 'default' : 'outline'} onClick={() => onCnpj(conta)}>
                {conta.cnpjProvisorio ? 'Informar CNPJ real' : 'Corrigir CNPJ'}
              </Button>

              {!resumo ? (
                <Carregando />
              ) : (
                <>
                  <section className="space-y-2">
                    <h3 className="font-semibold">Contatos ({resumo.pessoas.length})</h3>
                    {!resumo.pessoas.length && <p className="text-muted-foreground">Nenhum contato.</p>}
                    {resumo.pessoas.map((p, i) => (
                      <div key={i} className="rounded-md border p-2">
                        <p className="font-medium">{p.person.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {[p.person.cargo, p.person.email, p.person.telefone].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </section>
                  <section className="space-y-2">
                    <h3 className="font-semibold">Últimas notas</h3>
                    {!resumo.notas.length && <p className="text-muted-foreground">Nenhuma nota.</p>}
                    {resumo.notas.map((n) => (
                      <div key={n.id} className="rounded-md border p-2">
                        <p className="text-xs text-muted-foreground">{dataBr(n.createdAt)}</p>
                        <p className="whitespace-pre-wrap">{n.texto}</p>
                      </div>
                    ))}
                  </section>
                  <section className="space-y-2">
                    <h3 className="font-semibold">Histórico de etapas</h3>
                    {!resumo.historico.length && <p className="text-muted-foreground">Sem movimentações.</p>}
                    <ul className="space-y-1">
                      {resumo.historico.map((h, i) => (
                        <li key={i} className="text-xs">
                          <span className="text-muted-foreground">{dataBr(h.createdAt)}</span> · {h.fromStage?.nome ?? 'Entrada'} → {h.toStage.nome} ·{' '}
                          {h.user.name ?? h.user.email}
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
