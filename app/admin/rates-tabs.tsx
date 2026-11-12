'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, useApi, Empty, PAPEIS, PAPEL_LABEL, SEGMENTOS, SEGMENTO_LABEL, segKey } from './ui'

const cellKey = (a: string, s: string | null) => `${a}:${segKey(s)}`

/** Matriz linhas × segmentos com inputs em %. Retorna os valores digitados (string). */
function Matrix({ rows, values, onChange, readOnly }: {
  rows: { id: string; label: string }[]
  values: Record<string, string>
  onChange: (k: string, v: string) => void
  readOnly?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-2 font-medium" />
            {SEGMENTOS.map((s) => <th key={segKey(s)} className="px-1 py-2 font-medium">{SEGMENTO_LABEL[segKey(s)]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2 pr-2">{r.label}</td>
              {SEGMENTOS.map((s) => (
                <td key={segKey(s)} className="px-1 py-2">
                  <div className="relative w-24">
                    <Input
                      type="number" min={0} max={100} step="0.01" inputMode="decimal" disabled={readOnly}
                      className="pr-6" placeholder="—"
                      value={values[cellKey(r.id, s)] ?? ''}
                      onChange={(e) => onChange(cellKey(r.id, s), e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const splitKey = (k: string) => {
  const [a, s] = k.split(':')
  return { a, segmento: s === 'TODOS' ? null : s }
}

export function DiscountTab({ canEdit }: { canEdit: boolean }) {
  const { data, reload } = useApi<{ policies: { papel: string; segmento: string | null; tetoPorc: string }[] }>('/api/admin/discount-policy')
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => {
    if (data) setVals(Object.fromEntries(data.policies.map((p) => [cellKey(p.papel, p.segmento), String(Number(p.tetoPorc))])))
  }, [data])

  async function save() {
    const items = PAPEIS.flatMap((papel) =>
      SEGMENTOS.map((segmento) => {
        const v = vals[cellKey(papel, segmento)]
        return { papel, segmento, tetoPorc: v === undefined || v === '' ? null : Number(v) }
      }),
    )
    const r = await api<{ alterados: number }>('/api/admin/discount-policy', 'PUT', { items })
    if (r) {
      toast.success(r.alterados ? `${r.alterados} teto(s) atualizado(s)` : 'Nada mudou')
      reload()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alçadas de desconto</CardTitle>
        <CardDescription>
          Desconto máximo que cada papel pode conceder sem aprovação. Vazio = sem teto (não bloqueia). “Todos” vale quando não há teto específico do segmento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data ? <Empty>Carregando…</Empty> : (
          <Matrix rows={PAPEIS.map((p) => ({ id: p, label: PAPEL_LABEL[p] }))} values={vals} readOnly={!canEdit} onChange={(k, v) => setVals({ ...vals, [k]: v })} />
        )}
        {canEdit && <Button onClick={save}><Save className="mr-2 h-4 w-4" /> Salvar alçadas</Button>}
      </CardContent>
    </Card>
  )
}

interface ConvData {
  preset: string
  stages: { id: string; nome: string }[]
  vigentes: Record<string, number>
  historico: { id: string; stageId: string; segmento: string | null; taxaPorc: number; setadoEm: string; setadoPor: string }[]
}

export function ConversionTab({ canEdit }: { canEdit: boolean }) {
  const { data, reload } = useApi<ConvData>('/api/admin/conversion-rates')
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => {
    if (data) setVals(Object.fromEntries(Object.entries(data.vigentes).map(([k, v]) => [k, String(Math.round(v * 100) / 100)])))
  }, [data])

  async function save() {
    const items = Object.entries(vals)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => {
        const { a, segmento } = splitKey(k)
        return { stageId: a, segmento, taxaPorc: Number(v) }
      })
    if (!items.length) return toast.info('Preencha ao menos um índice')
    const r = await api<{ alterados: number }>('/api/admin/conversion-rates', 'POST', { items })
    if (r) {
      toast.success(r.alterados ? `${r.alterados} índice(s) atualizado(s)` : 'Nada mudou')
      reload()
    }
  }

  const nome = new Map(data?.stages.map((s) => [s.id, s.nome]))
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Índices de conversão por etapa</CardTitle>
          <CardDescription>
            Probabilidade (%) de uma oportunidade na etapa virar venda. Usada na previsão ponderada do pipeline (preset {data?.preset ?? '…'}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? <Empty>Carregando…</Empty> : (
            <Matrix rows={data.stages.map((s) => ({ id: s.id, label: s.nome }))} values={vals} readOnly={!canEdit} onChange={(k, v) => setVals({ ...vals, [k]: v })} />
          )}
          {canEdit && <Button onClick={save}><Save className="mr-2 h-4 w-4" /> Salvar índices</Button>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de índices</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.historico.length ? <Empty>Sem alterações ainda.</Empty> : (
            <ul className="divide-y text-sm">
              {data.historico.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{nome.get(h.stageId)} · {SEGMENTO_LABEL[segKey(h.segmento)]}: <b>{Math.round(h.taxaPorc * 100) / 100}%</b></span>
                  <span className="text-xs text-muted-foreground">{h.setadoPor} · {new Date(h.setadoEm).toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
