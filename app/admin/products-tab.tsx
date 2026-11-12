'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { api, useApi, NativeSelect, Empty, SEGMENTO_LABEL } from './ui'

interface Produto {
  id: string
  codigo: string
  nome: string
  tipo: 'PRODUTO' | 'SERVICO'
  segmento: 'VAREJO' | 'INDUSTRIA' | null
  tipoMidia: string | null
  descricao: string | null
  ativo: boolean
}
interface Dados {
  produtos: Produto[]
  departamentos: { id: string; nome: string; ativo: boolean; _count: { filhos: number } }[]
  porNivel: { nivel: number; total: number }[]
}

const NIVEL = ['', 'Departamentos', 'Categorias', 'Subcategorias', 'Itens']
const vazio = { codigo: '', nome: '', tipo: 'SERVICO', segmento: '', tipoMidia: '' }

export function ProductsTab() {
  const { data, reload } = useApi<Dados>('/api/admin/products')
  const [novo, setNovo] = useState(vazio)

  async function add() {
    const body = { ...novo, segmento: novo.segmento || null, tipoMidia: novo.tipoMidia || null, descricao: null, ativo: true }
    if (await api('/api/admin/products', 'POST', body)) {
      toast.success('Produto adicionado')
      setNovo(vazio)
      reload()
    }
  }
  async function patch(id: string, body: Partial<Produto>) {
    if (await api(`/api/admin/products/${id}`, 'PATCH', body)) reload()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Produtos e serviços</CardTitle>
          <CardDescription>Itens que entram nas oportunidades e propostas. Sem preço nesta versão: o valor é informado na proposta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr_8rem_8rem_8rem_auto]">
            <Input placeholder="Código" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
            <Input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <NativeSelect value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>
              <option value="SERVICO">Serviço</option>
              <option value="PRODUTO">Produto</option>
            </NativeSelect>
            <NativeSelect value={novo.segmento} onChange={(e) => setNovo({ ...novo, segmento: e.target.value })}>
              <option value="">Todos</option>
              <option value="VAREJO">Varejo</option>
              <option value="INDUSTRIA">Indústria</option>
            </NativeSelect>
            <Input placeholder="Mídia" value={novo.tipoMidia} onChange={(e) => setNovo({ ...novo, tipoMidia: e.target.value })} />
            <Button onClick={add} disabled={novo.codigo.trim().length < 2 || novo.nome.trim().length < 2}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
          {data && !data.produtos.length && <Empty>Nenhum produto cadastrado.</Empty>}
          <div className="grid gap-2">
            {data?.produtos.map((p) => (
              <div key={p.id} className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${p.ativo ? '' : 'opacity-60'}`}>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{p.codigo}</span>
                    {p.nome}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{p.tipo === 'SERVICO' ? 'Serviço' : 'Produto'}</Badge>
                    <Badge variant="outline">{p.segmento ? SEGMENTO_LABEL[p.segmento] : 'Todos os segmentos'}</Badge>
                    {p.tipoMidia && <Badge variant="outline">{p.tipoMidia}</Badge>}
                  </div>
                  {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                </div>
                <Switch checked={p.ativo} onCheckedChange={(v) => patch(p.id, { ativo: v })} aria-label="Ativo" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Árvore de categorias monitoradas</CardTitle>
          <CardDescription>Importada da base comercial (até 4 níveis). Usada no escopo das oportunidades de Indústria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {data?.porNivel.map((n) => (
              <Badge key={n.nivel} variant="secondary">{n.total} {NIVEL[n.nivel]?.toLowerCase()}</Badge>
            ))}
          </div>
          {data && !data.departamentos.length && <Empty>Nenhuma categoria importada.</Empty>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data?.departamentos.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="truncate">{d.nome}</span>
                <span className="text-xs text-muted-foreground">{d._count.filhos} categorias</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
