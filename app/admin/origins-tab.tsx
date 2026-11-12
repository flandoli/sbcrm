'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, useApi, NativeSelect, Empty } from './ui'

interface Partner { id: string; nome: string; contato: string | null; feePorc: string; ativo: boolean }
interface Origin { id: string; nome: string; tipo: string; parceiroId: string | null; ativo: boolean; parceiro: { nome: string } | null }

const TIPO_LABEL: Record<string, string> = {
  MIDIA: 'Mídia', PARCEIRO: 'Parceiro', INDICACAO: 'Indicação', PROSPECCAO: 'Prospecção ativa', EVENTO: 'Evento', OUTRO: 'Outro',
}

export function OriginsTab() {
  const partners = useApi<{ partners: Partner[] }>('/api/admin/partners')
  const origins = useApi<{ origins: Origin[] }>('/api/admin/origins')
  const [np, setNp] = useState({ nome: '', contato: '', feePorc: '' })
  const [no, setNo] = useState({ nome: '', tipo: 'MIDIA', parceiroId: '' })

  async function addPartner() {
    if (await api('/api/admin/partners', 'POST', { ...np, contato: np.contato || null, feePorc: np.feePorc || 0 })) {
      toast.success('Parceiro cadastrado')
      setNp({ nome: '', contato: '', feePorc: '' })
      partners.reload()
    }
  }
  async function patchPartner(id: string, body: object) {
    if (await api(`/api/admin/partners/${id}`, 'PATCH', body)) partners.reload()
  }
  async function addOrigin() {
    if (await api('/api/admin/origins', 'POST', { ...no, parceiroId: no.parceiroId || null })) {
      toast.success('Origem cadastrada')
      setNo({ nome: '', tipo: 'MIDIA', parceiroId: '' })
      origins.reload()
    }
  }
  async function patchOrigin(id: string, body: object) {
    if (await api(`/api/admin/origins/${id}`, 'PATCH', body)) origins.reload()
  }

  const ativos = partners.data?.partners.filter((p) => p.ativo) ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Origens do lead</CardTitle>
          <CardDescription>Origem do tipo Parceiro exige parceiro vinculado. Desativar tira a origem dos seletores, sem apagar o histórico.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <Input placeholder="Nome da origem" value={no.nome} onChange={(e) => setNo({ ...no, nome: e.target.value })} />
            <NativeSelect value={no.tipo} onChange={(e) => setNo({ ...no, tipo: e.target.value })}>
              {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
            {no.tipo === 'PARCEIRO' && (
              <NativeSelect value={no.parceiroId} onChange={(e) => setNo({ ...no, parceiroId: e.target.value })} className="sm:col-span-2">
                <option value="">Selecione o parceiro…</option>
                {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </NativeSelect>
            )}
            <Button onClick={addOrigin} className="sm:col-span-2" disabled={no.nome.trim().length < 2}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar origem
            </Button>
          </div>
          {origins.data && !origins.data.origins.length && <Empty>Nenhuma origem cadastrada.</Empty>}
          {origins.data?.origins.map((o) => (
            <div key={o.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${o.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="truncate font-medium">{o.nome}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">{TIPO_LABEL[o.tipo]}</Badge>
                  {o.parceiro && <Badge variant="secondary">{o.parceiro.nome}</Badge>}
                </div>
              </div>
              <Switch checked={o.ativo} onCheckedChange={(v) => patchOrigin(o.id, { ativo: v })} aria-label="Ativa" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parceiros</CardTitle>
          <CardDescription>O fee (%) é copiado para o faturamento no fechamento da oportunidade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
            <Input placeholder="Nome do parceiro" value={np.nome} onChange={(e) => setNp({ ...np, nome: e.target.value })} />
            <Input type="number" min={0} max={100} step="0.01" placeholder="Fee %" value={np.feePorc} onChange={(e) => setNp({ ...np, feePorc: e.target.value })} />
            <Input placeholder="Contato (opcional)" className="sm:col-span-2" value={np.contato} onChange={(e) => setNp({ ...np, contato: e.target.value })} />
            <Button onClick={addPartner} className="sm:col-span-2" disabled={np.nome.trim().length < 2}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar parceiro
            </Button>
          </div>
          {partners.data && !partners.data.partners.length && <Empty>Nenhum parceiro cadastrado.</Empty>}
          {partners.data?.partners.map((p) => (
            <div key={p.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${p.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="truncate font-medium">{p.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{p.contato || 'sem contato'}</p>
              </div>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="w-24"
                defaultValue={Number(p.feePorc)}
                aria-label="Fee %"
                onBlur={(e) => Number(e.target.value) !== Number(p.feePorc) && patchPartner(p.id, { feePorc: e.target.value })}
              />
              <Switch checked={p.ativo} onCheckedChange={(v) => patchPartner(p.id, { ativo: v })} aria-label="Ativo" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
