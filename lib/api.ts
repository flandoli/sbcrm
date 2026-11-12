import { NextResponse } from 'next/server'
import type { Papel } from '@prisma/client'
import { getSessionUser, type SessionUser } from '@/lib/session'

export const jsonError = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** Exige sessão e, se informado, um dos papéis. Retorna o usuário ou a resposta de erro pronta. */
export async function requireUser(...papeis: Papel[]): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) return jsonError('Não autorizado', 401)
  if (papeis.length && !papeis.includes(user.papel)) return jsonError('Sem permissão', 403)
  return user
}

export async function readJson<T = any>(req: Request): Promise<T> {
  return ((await req.json().catch(() => ({}))) ?? {}) as T
}

/** Converte erros do Prisma conhecidos em mensagens legíveis. */
export function prismaError(e: any): NextResponse {
  if (e?.code === 'P2002') return jsonError('Já existe um registro com esses dados', 409)
  if (e?.code === 'P2025') return jsonError('Registro não encontrado', 404)
  console.error(e)
  return jsonError(e?.message ?? 'Erro interno', 500)
}
