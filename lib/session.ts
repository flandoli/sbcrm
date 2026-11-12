import { getServerSession } from 'next-auth'
import type { Papel, Segmento } from '@prisma/client'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  papel: Papel
  segmento: Segmento | null
}

/**
 * Usuário da sessão, relido do banco a cada chamada: papel/segmento alterados pelo Admin valem na hora,
 * e usuário desativado perde o acesso às APIs mesmo com JWT ainda válido.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, papel: true, segmento: true, ativo: true },
  })
  if (!u?.ativo) return null
  return { id: u.id, email: u.email, name: u.name, papel: u.papel, segmento: u.segmento }
}

export function hasRole(user: SessionUser | null, ...papeis: Papel[]): boolean {
  return !!user && papeis.includes(user.papel)
}
