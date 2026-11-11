'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, useApi, NativeSelect, PAPEIS, PAPEL_LABEL } from './ui'

interface Stage { id: string; nome: string; ordem: number; terminal: boolean; resultado: 'FECHADO' | 'PERDIDO' | null; ativo: boolean }
interface Tr { fromStageId: string | null; toStageId: string; papeis: string[] }
interface Data { preset: 'v1' | 'v2'; presetAtivo: 'v1' | 'v2'; stages: Stage[]; transitions: Tr[]; abertasPorEtapa: Record<string, number> }

const PRESET_LABEL = { v1: 'v1 — Funil atual (venda tradicional)', v2: 'v2 — Funil invertido (captação por mídia)' }
const key = (f: string | null, t: string) => `${f ?? 'ENTRADA'}>${t}`

export function FunnelTab() {
  const [preset, setPreset] = useState<'v1' | 'v2' | ''>('')
  const { data, reload } = useApi<Data>(`/api/admin/stages${preset ? `?preset=${preset}` : ''}`)
  const [graph, setGraph] = useState<Record<string, string[]>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [novo, setNovo] = useState({ nome: '', tipo: 'ABERTA' })

  useEffect(() => {
    if (!data) return
    if (!preset) setPreset(data.preset)
    setGraph(Object.fromEntries(data.transitions.map((t) => [key(t.fromStageId, t.toStageId), t.papeis])))
    setNames(Object.fromEntries(data.stages.map((s) => [s.id, s.nome])))
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const stages = data.stages
  const origens: (Stage | null)[] = [null, ...stages.filter((s) => !s.terminal && s.ativo)]
  const destinos = stages.filter((s) => s.ativo)

  async function patchStage(s: Stage, body: Partial<Stage>) {
    if (await api(`/api/admin/stages/${s.id}`, 'PATCH', body)) {
      toast.success('Etapa atualizada')
      reload()
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const ids = stages.map((s) => s.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    if (await api('/api/admin/stages/reorder', 'POST', { preset: data!.preset, ids })) reload()
  }

  async function addStage() {
    const terminal = novo.tipo !== 'ABERTA'
    const body = { preset: data!.preset, nome: novo.nome, terminal, resultado: terminal ? novo.tipo : null }
    if (await api('/api/admin/stages', 'POST', body)) {
      toast.success('Etapa adicionada')
      setNovo({ nome: '', tipo: 'ABERTA' })
      reload()
    }
  }

  async function activate() {
    if (await api('/api/settings', 'PUT', { key: 'funnel_preset', value: data!.preset })) {
      toast.success(`Preset ${data!.preset} ativado no Kanban`)
      reload()
    }
  }

  function toggle(f: string | null, t: string, papel: string) {
    const k = key(f, t)
    const cur = graph[k] ?? []
    const next = cur.includes(papel) ? cur.filter((p) => p !== papel) : [...cur, papel]
    setGraph({ ...graph, [k]: next })
  }

  async function saveGraph() {
    const transitions = Object.entries(graph)
      .filter(([, papeis]) => papeis.length)
      .map(([k, papeis]) => {
        const [f, t] = k.split('>')
        return { fromStageId: f === 'ENTRADA' ? null : f, toStageId: t, papeis }
      })
    if (await api('/api/admin/transitions', 'PUT', { preset: data!.preset, transitions })) {
      toast.success('Transições salvas')
      reload()
    }
  }

  async function resetGraph() {
    if (!confirm('Restaurar as transições padrão deste preset?')) return
    if (await api('/api/admin/transitions', 'PUT', { preset: data!.preset, reset: true })) {
      toast.success('Transições padrão restauradas')
      reload()
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Preset do funil</CardTitle>
          <CardDescription>O preset ativo define as colunas do Kanban. Os dois ficam configurados; só um vale por vez.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <NativeSelect value={data.preset} onChange={(e) => setPreset(e.target.value as 'v1' | 'v2')} className="sm:max-w-sm">
            <option value="v1">{PRESET_LABEL.v1}</option>
            <option value="v2">{PRESET_LABEL.v2}</option>
          </NativeSelect>
          {data.preset === data.presetAtivo ? (
            <Badge className="w-fit">Ativo no Kanban</Badge>
          ) : (
            <Button variant="outline" onClick={activate}>Ativar este preset</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas</CardTitle>
          <CardDescription>Reordene, renomeie ou desative. Etapas terminais encerram a oportunidade (Perdido exige motivo).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {stages.map((s, i) => (
            <div key={s.id} className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${s.ativo ? '' : 'opacity-60'}`}>
              <div className="flex flex-col">
                <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Descer" disabled={i === stages.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <Input
                className="min-w-[10rem] flex-1"
                value={names[s.id] ?? s.nome}
                onChange={(e) => setNames({ ...names, [s.id]: e.target.value })}
                onBlur={() => names[s.id] && names[s.id] !== s.nome && patchStage(s, { nome: names[s.id] })}
              />
              {s.terminal && <Badge variant={s.resultado === 'FECHADO' ? 'default' : 'destructive'}>{s.resultado === 'FECHADO' ? 'Ganho' : 'Perdido'}</Badge>}
              {!!data.abertasPorEtapa[s.id] && <Badge variant="outline">{data.abertasPorEtapa[s.id]} abertas</Badge>}
              <label className="flex items-center gap-1 text-xs">
                <Switch checked={s.ativo} onCheckedChange={(v) => patchStage(s, { ativo: v })} /> Ativa
              </label>
            </div>
          ))}
          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
            <Input placeholder="Nova etapa" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <NativeSelect value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} className="sm:w-48">
              <option value="ABERTA">Etapa aberta</option>
              <option value="FECHADO">Terminal — Ganho</option>
              <option value="PERDIDO">Terminal — Perdido</option>
            </NativeSelect>
            <Button onClick={addStage} disabled={novo.nome.trim().length < 2}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transições permitidas</CardTitle>
          <CardDescription>Para cada etapa de origem, marque quais papéis podem mover o card para cada destino. Sem papel marcado = movimento bloqueado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {origens.map((o) => (
            <div key={o?.id ?? 'ENTRADA'} className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">De: {o ? o.nome : 'Entrada (nova oportunidade)'}</p>
              <div className="space-y-1">
                {destinos
                  .filter((d) => d.id !== o?.id)
                  .map((d) => {
                    const papeis = graph[key(o?.id ?? null, d.id)] ?? []
                    return (
                      <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className={papeis.length ? '' : 'text-muted-foreground'}>→ {d.nome}</span>
                        <div className="flex gap-3">
                          {PAPEIS.map((p) => (
                            <label key={p} className="flex items-center gap-1 text-xs">
                              <Checkbox checked={papeis.includes(p)} onCheckedChange={() => toggle(o?.id ?? null, d.id, p)} />
                              {PAPEL_LABEL[p]}
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveGraph}>
              <Save className="mr-2 h-4 w-4" /> Salvar transições
            </Button>
            <Button variant="outline" onClick={resetGraph}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restaurar padrão
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
