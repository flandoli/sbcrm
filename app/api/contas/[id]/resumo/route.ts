export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jsonError, requireUser } from '@/lib/api'
import { accountScope } from '@/lib/accounts'

// Resumo da conta para o painel do Kanban: contatos, últimas notas e histórico de etapas.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const conta = await prisma.account.findFirst({
    where: { AND: [{ id: params.id }, accountScope(user)] },
    select: {
      id: true,
      pessoas: { select: { papel: true, principal: true, person: { select: { nome: true, cargo: true, email: true, telefone: true } } }, take: 20 },
      notas: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, texto: true, createdAt: true } },
      oportunidades: {
        select: {
          historico: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { createdAt: true, fromStage: { select: { nome: true } }, toStage: { select: { nome: true } }, user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  })
  if (!conta) return jsonError('Conta não encontrada', 404)
  const historico = conta.oportunidades
    .flatMap((o) => o.historico)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
  return NextResponse.json({ id: conta.id, pessoas: conta.pessoas, notas: conta.notas, historico })
}
