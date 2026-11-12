'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApi, NativeSelect, Empty } from './ui'

interface Log {
  id: string; acao: string; entidade: string; entidadeId: string | null
  valorAnterior: unknown; valorNovo: unknown; createdAt: string
  user: { email: string; name: string | null } | null
}

const ENTIDADES: Record<string, string> = {
  '': 'Todas',
  User: 'Usuários',
  Stage: 'Etapas',
  StageTransition: 'Transições',
  LeadOrigin: 'Origens',
  Partner: 'Parceiros',
  CatalogItem: 'Catálogos',
  DiscountPolicy: 'Alçadas',
  StageConversionRate: 'Índices de conversão',
  Setting: 'Configurações',
  Lead: 'Leads',
}

const fmt = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v))

export function AuditTab() {
  const [entidade, setEntidade] = useState('')
  const { data } = useApi<{ logs: Log[] }>(`/api/audit-log?limit=200${entidade ? `&entidade=${entidade}` : ''}`)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Histórico de alterações</CardTitle>
        <NativeSelect value={entidade} onChange={(e) => setEntidade(e.target.value)} className="w-48">
          {Object.entries(ENTIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </CardHeader>
      <CardContent>
        {!data ? <Empty>Carregando…</Empty> : !data.logs.length ? <Empty>Nenhum registro.</Empty> : (
          <ul className="divide-y text-sm">
            {data.logs.map((l) => (
              <li key={l.id} className="space-y-1 py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono text-xs">{l.acao}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.user?.name ?? l.user?.email ?? 'sistema'} · {new Date(l.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{l.entidade}{l.entidadeId ? ` · ${l.entidadeId}` : ''}</summary>
                  <p className="mt-1 break-all"><b>Antes:</b> {fmt(l.valorAnterior)}</p>
                  <p className="break-all"><b>Depois:</b> {fmt(l.valorNovo)}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
