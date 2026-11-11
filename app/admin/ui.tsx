'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export const PAPEL_LABEL = { ADMIN: 'Admin', DIRETOR: 'Diretor', GERENTE: 'Gerente', VENDEDOR: 'Vendedor' } as const
export const PAPEIS = Object.keys(PAPEL_LABEL) as (keyof typeof PAPEL_LABEL)[]
export const SEGMENTO_LABEL: Record<string, string> = { TODOS: 'Todos', VAREJO: 'Varejo', INDUSTRIA: 'Indústria' }
export const SEGMENTOS: (string | null)[] = [null, 'VAREJO', 'INDUSTRIA']
export const segKey = (s: string | null) => s ?? 'TODOS'

/** Chamada JSON com toast de erro. Retorna o corpo ou null em caso de falha. */
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T | null> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    toast.error(data?.error ?? `Erro ${res.status}`)
    return null
  }
  return data as T
}

/** Carrega um endpoint e expõe reload. */
export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const reload = useCallback(() => {
    api<T>(url).then((d) => d && setData(d))
  }, [url])
  useEffect(reload, [reload])
  return { data, reload }
}

export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
