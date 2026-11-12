'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Search } from 'lucide-react'
import { FcShell } from '@/components/fc-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, useApi, Empty, SEGMENTO_LABEL } from '../admin/ui'

interface Conta {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string
  cnpjProvisorio: boolean
  segmento: string
  statusConta: 'PROSPECT' | 'CLIENTE'
  responsavel: { name: string | null; email: string }
  origem: { nome: string } | null
  _count: { oportunidades: number; pessoas: number; notas: number }
}

const mascara = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function ContasClient() {
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [soProvisorio, setSoProvisorio] = useState(false)
  const { data, reload } = useApi<{ contas: Conta[]; totalProvisorio: number }>(
    `/api/contas?q=${encodeURIComponent(busca)}${soProvisorio ? '&provisorio=1' : ''}`,
  )
  const [editando, setEditando] = useState<Conta | null>(null)
  const [cnpj, setCnpj] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setBusca(q), 300)
    return () => clearTimeout(t)
  }, [q])

  async function salvar() {
    if (!editando) return
    if (await api(`/api/contas/${editando.id}/cnpj`, 'PATCH', { cnpj })) {
      toast.success('CNPJ atualizado')
      setEditando(null)
      reload()
    }
  }

  return (
    <FcShell title="Contas">
      <div className="mx-auto max-w-5xl space-y-4">
        {!!data?.totalProvisorio && (
          <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              <strong>{data.totalProvisorio}</strong> conta(s) com CNPJ provisório. Elas podem ser trabalhadas no funil, mas
              não podem ser fechadas nem faturadas até receber o CNPJ real.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={soProvisorio} onCheckedChange={(v) => setSoProvisorio(v === true)} /> Só CNPJ provisório
          </label>
        </div>
        {data && !data.contas.length && <Empty>Nenhuma conta encontrada.</Empty>}
        <div className="grid gap-2">
          {data?.contas.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{c.razaoSocial}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{c.cnpj}</span>
                    {c.cnpjProvisorio && <Badge variant="outline" className="border-amber-500 text-amber-600">CNPJ provisório</Badge>}
                    <Badge variant="secondary">{SEGMENTO_LABEL[c.segmento]}</Badge>
                    <Badge variant={c.statusConta === 'CLIENTE' ? 'default' : 'outline'}>{c.statusConta === 'CLIENTE' ? 'Cliente' : 'Prospect'}</Badge>
                    {c.origem && <span>{c.origem.nome}</span>}
                    <span>· {c.responsavel.name ?? c.responsavel.email}</span>
                    <span>· {c._count.oportunidades} oport. · {c._count.pessoas} contatos · {c._count.notas} notas</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={c.cnpjProvisorio ? 'default' : 'outline'}
                  onClick={() => {
                    setEditando(c)
                    setCnpj(c.cnpjProvisorio ? '' : c.cnpj)
                  }}
                >
                  {c.cnpjProvisorio ? 'Informar CNPJ real' : 'Corrigir CNPJ'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CNPJ — {editando?.razaoSocial}</DialogTitle>
            <DialogDescription>
              {editando?.cnpjProvisorio ? `CNPJ provisório atual: ${editando.cnpj}. ` : ''}A alteração fica registrada no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(mascara(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={cnpj.replace(/\D/g, '').length !== 14}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FcShell>
  )
}
