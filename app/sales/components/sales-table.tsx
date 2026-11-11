'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Link2, Link2Off, ChevronLeft, ChevronRight } from 'lucide-react'

export interface SaleRow {
  id: string
  matricula: string
  dataMatricula: string | null
  nome: string | null
  email: string | null
  phoneRaw: string
  curso: string | null
  valorPago: number | null
  formaPgto: string | null
  midia: string | null
  formaContato: string | null
  matched: boolean
  lead: {
    id: string
    name: string | null
    status: string
    channel: string | null
    adTitle: string | null
    campaignName: string | null
  } | null
}

const CHANNEL_LABELS: Record<string, string> = {
  pago_meta: 'Meta Ads',
  pago_google: 'Google Ads',
  pago_outro: 'Mídia Paga',
  organico: 'Orgânico',
  direto: 'Direto',
}

function money(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

export function SalesTable({
  sales,
  loading,
  page,
  total,
  limit,
  onPageChange,
}: {
  sales: SaleRow[]
  loading: boolean
  page: number
  total: number
  limit: number
  onPageChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3">Aluno</th>
                <th className="px-3 py-3">Curso</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Mídia</th>
                <th className="px-3 py-3">Lead</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={6} className="px-3 py-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhuma matrícula no período. Importe sua planilha para começar.
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <div className="font-medium">{s.nome || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.phoneRaw || '—'} · #{s.matricula}
                      </div>
                    </td>
                    <td className="px-3 py-3">{s.curso || '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold font-mono">
                      {money(s.valorPago)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{fmtDate(s.dataMatricula)}</td>
                    <td className="px-3 py-3">
                      {s.midia ? (
                        <Badge variant="secondary" className="text-xs">{s.midia}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {s.matched && s.lead ? (
                        <div className="flex items-start gap-1.5">
                          <Link2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                          <div>
                            <div className="text-xs font-medium">
                              {CHANNEL_LABELS[s.lead.channel ?? ''] ?? 'Lead'}
                            </div>
                            {s.lead.adTitle && (
                              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {s.lead.adTitle}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Link2Off className="h-3.5 w-3.5" />
                          Sem lead
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-3">
            <p className="text-sm text-muted-foreground">
              {total} matrícula(s) · página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
