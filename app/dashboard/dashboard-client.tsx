'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FcShell } from '@/components/fc-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { channelLabel } from '@/lib/channel-utils'
import { maskPhone } from '@/lib/phone-utils'

const STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo',
  QUALIFICADO: 'Qualificado',
  SEM_INTERESSE: 'Sem interesse',
  DDD_INDESEJADO: 'DDD indesejado',
  DDI_INDESEJADO: 'DDI indesejado',
  INVALIDO: 'Inválido',
}

interface Lead {
  id: string
  name: string | null
  phoneNormalized: string
  email: string | null
  channel: string | null
  source: string | null
  status: string
  createdAt: string
}

interface Stats {
  total: number
  status: Record<string, number>
}

export function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, s] = await Promise.all([
        fetch(`/api/leads?limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.json()),
        fetch('/api/leads/stats').then((r) => r.json()),
      ])
      setLeads(l.leads ?? [])
      setStats(s)
    } catch {
      toast.error('Erro ao carregar leads')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function changeStatus(id: string, status: string) {
    const res = await fetch(`/api/leads/${id}/qualify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) return toast.error('Falha ao atualizar status')
    toast.success('Status atualizado')
    load()
  }

  const cards = [
    { label: 'Total', value: stats?.total ?? 0 },
    { label: 'Novos', value: stats?.status?.NOVO ?? 0 },
    { label: 'Qualificados', value: stats?.status?.QUALIFICADO ?? 0 },
    { label: 'DDD/DDI indesejado', value: (stats?.status?.DDD_INDESEJADO ?? 0) + (stats?.status?.DDI_INDESEJADO ?? 0) },
  ]

  return (
    <FcShell title="Leads">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="font-mono text-2xl font-bold">{loading ? '—' : c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Input placeholder="Buscar por nome, e-mail ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />

        {!loading && leads.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lead cadastrado.</p>
        )}

        <div className="space-y-2">
          {leads.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.name ?? 'Sem nome'}</p>
                  <p className="text-sm text-muted-foreground">
                    {maskPhone(l.phoneNormalized)} · {new Date(l.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{channelLabel(l.channel)}</Badge>
                  <select
                    aria-label="Status do lead"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={l.status}
                    onChange={(e) => changeStatus(l.id, e.target.value)}
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </FcShell>
  )
}
