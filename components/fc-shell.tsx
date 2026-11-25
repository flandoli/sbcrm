'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Building2, LayoutDashboard, Settings, LogOut, MessageSquare, ShieldCheck } from 'lucide-react'
import { AppShell } from '@/components/layouts/app-shell'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV: { href: string; label: string; icon: typeof Settings; papeis?: string[] }[] = [
  { href: '/dashboard', label: 'Leads', icon: LayoutDashboard },
  { href: '/contas', label: 'Contas', icon: Building2 },
  { href: '/mensagens', label: 'Mensagens', icon: MessageSquare },
  { href: '/settings', label: 'Configurações', icon: Settings },
  { href: '/admin', label: 'Admin', icon: ShieldCheck, papeis: ['ADMIN', 'DIRETOR'] },
]

/** Disparado pela página de mensagens ao marcar mensagens como lidas (atualiza o badge na hora). */
export const MESSAGES_READ_EVENT = 'fc:messages-read'

/** Total de mensagens não lidas, consultado a cada 30s. */
export function useUnreadMessages() {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/messages?count=1')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setUnread(Number(d.unread) || 0))
        .catch(() => {})
    load()
    const t = setInterval(load, 30000)
    window.addEventListener(MESSAGES_READ_EVENT, load)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener(MESSAGES_READ_EVENT, load)
    }
  }, [])
  return unread
}

export function FcShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const { data } = useSession()
  const unread = useUnreadMessages()

  const sidebar = (
    <div className="flex h-full flex-col gap-6">
      <div className="px-2">
        <p className="font-display text-lg font-semibold">Funil Comercial</p>
        <p className="text-xs text-muted-foreground">sbcrm</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.filter((n) => !n.papeis || n.papeis.includes(data?.user?.papel ?? '')).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
              pathname?.startsWith(href) && 'bg-accent font-medium',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
            {href === '/mensagens' && unread > 0 && (
              <span
                className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
                aria-label={`${unread} não lidas`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto space-y-2 border-t pt-4 px-2">
        <p className="truncate text-sm">{data?.user?.email}</p>
        <p className="text-xs text-muted-foreground">{data?.user?.papel}</p>
        <Button variant="outline" size="sm" className="w-full" onClick={() => signOut({ callbackUrl: '/login' })}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  )

  return (
    <AppShell
      sidebar={sidebar}
      header={
        <div className="flex w-full items-center justify-between">
          <h1 className="font-display text-base font-semibold">{title}</h1>
          <ThemeToggle />
        </div>
      }
    >
      {children}
    </AppShell>
  )
}
