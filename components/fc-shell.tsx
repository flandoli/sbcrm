'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LayoutDashboard, Settings, LogOut } from 'lucide-react'
import { AppShell } from '@/components/layouts/app-shell'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Leads', icon: LayoutDashboard },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function FcShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const { data } = useSession()

  const sidebar = (
    <div className="flex h-full flex-col gap-6">
      <div className="px-2">
        <p className="font-display text-lg font-semibold">Funil Comercial</p>
        <p className="text-xs text-muted-foreground">sbcrm</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
              pathname?.startsWith(href) && 'bg-accent font-medium',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
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
