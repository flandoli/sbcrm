'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, useApi, NativeSelect, Empty } from './ui'

interface Item { id: string; tipo: string; nome: string; codigo: string | null; ordem: number; ativo: boolean }

const TIPOS: Record<string, string> = {
  CATEGORIA: 'Categorias',
  UF: 'UFs / regiões',
  RELATORIO: 'Relatórios',
  TIPO_MIDIA: 'Tipos de mídia',
  PRACA: 'Praças',
  FONTE_INFO: 'Fontes de informação',
}

export function CatalogTab() {
  const [tipo, setTipo] = useState('CATEGORIA')
  const { data, reload } = useApi<{ items: Item[] }>(`/api/admin/catalog?tipo=${tipo}`)
  const [novo, setNovo] = useState({ nome: '', codigo: '' })

  async function add() {
    const ordem = (data?.items.reduce((m, i) => Math.max(m, i.ordem), 0) ?? 0) + 1
    if (await api('/api/admin/catalog', 'POST', { tipo, nome: novo.nome, codigo: novo.codigo || null, ordem })) {
      toast.success('Item adicionado')
      setNovo({ nome: '', codigo: '' })
      reload()
    }
  }
  async function patch(id: string, body: object) {
    if (await api(`/api/admin/catalog/${id}`, 'PATCH', body)) reload()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listas do escopo</CardTitle>
        <CardDescription>Usadas no cadastro do escopo da oportunidade. Item desativado some dos seletores, mas continua nos registros antigos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value)} className="sm:max-w-xs">
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <Input placeholder="Código (opcional)" className="sm:w-40" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
          <Button onClick={add} disabled={!novo.nome.trim()}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>
        {data && !data.items.length && <Empty>Nenhum item nesta lista.</Empty>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((i) => (
            <div key={i.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${i.ativo ? '' : 'opacity-60'}`}>
              <span className="truncate">
                {i.codigo && <span className="mr-1 font-mono text-xs text-muted-foreground">{i.codigo}</span>}
                {i.nome}
              </span>
              <Switch checked={i.ativo} onCheckedChange={(v) => patch(i.id, { ativo: v })} aria-label="Ativo" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
