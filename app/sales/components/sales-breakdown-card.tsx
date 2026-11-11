'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export interface BreakdownRow {
  label: string
  count: number
  receita: number
}

function money(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function SalesBreakdownCard({
  title,
  icon,
  rows,
  loading,
  max = 6,
}: {
  title: string
  icon: React.ReactNode
  rows: BreakdownRow[]
  loading: boolean
  max?: number
}) {
  const top = rows.slice(0, max)
  const totalCount = rows.reduce((s, r) => s + r.count, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : top.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <div className="space-y-3">
            {top.map((r) => {
              const pct = totalCount > 0 ? (r.count / totalCount) * 100 : 0
              return (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium truncate mr-2">{r.label}</span>
                    <span className="font-mono text-muted-foreground shrink-0">
                      {r.count} · {money(r.receita)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
