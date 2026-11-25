'use client'

import Link from 'next/link'
import { ArrowRight, MessageSquare } from 'lucide-react'
import { useUnreadMessages } from '@/components/fc-shell'

/**
 * Banner do dashboard: aparece só quando há mensagens não lidas.
 * Mesma fonte do badge do menu (GET /api/messages?count=1, a cada 30s e ao ler mensagens).
 */
export function DashboardMessagesBadge() {
  const unread = useUnreadMessages()
  if (unread <= 0) return null

  const texto = unread === 1 ? 'Você tem 1 mensagem não lida' : `Você tem ${unread} mensagens não lidas`

  return (
    <Link
      href="/mensagens"
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm transition-colors hover:bg-primary/15"
    >
      <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
      <span className="flex-1 font-medium">{texto}</span>
      <span className="flex items-center gap-1 text-primary">
        Ver mensagens <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  )
}
