import { getServerSession } from 'next-auth'
import type { Papel } from '@prisma/client'
import { authOptions } from '@/lib/auth-options'

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  papel: Papel
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name,
    papel: (session.user.papel ?? 'VENDEDOR') as Papel,
  }
}

export function hasRole(user: SessionUser | null, ...papeis: Papel[]): boolean {
  return !!user && papeis.includes(user.papel)
}
