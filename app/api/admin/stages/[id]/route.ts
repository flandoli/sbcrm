export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'

const patchSchema = z.object({
  nome: z.string().trim().min(2, 'Nome obrigatório').max(60).optional(),
  ativo: z.boolean().optional(),
  terminal: z.boolean().optional(),
  resultado: z.enum(['FECHADO', 'PERDIDO']).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = patchSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)

  const before = await prisma.stage.findUnique({ where: { id: params.id } })
  if (!before) return jsonError('Etapa não encontrada', 404)
  const d = parsed.data
  const terminal = d.terminal ?? before.terminal
  const resultado = d.resultado !== undefined ? d.resultado : before.resultado
  if (terminal && !resultado) return jsonError('Etapa terminal precisa de resultado (Fechado ou Perdido)')
  const next = { ...d, resultado: terminal ? resultado : null }

  // Desativar ou tornar terminal uma etapa com oportunidades abertas deixaria cards órfãos no Kanban.
  if ((d.ativo === false && before.ativo) || (terminal && !before.terminal)) {
    const abertas = await prisma.opportunity.count({ where: { stageId: params.id, resultado: null } })
    if (abertas) return jsonError(`Há ${abertas} oportunidade(s) aberta(s) nesta etapa. Mova-as antes.`, 409)
  }
  try {
    const stage = await prisma.$transaction(async (tx) => {
      const s = await tx.stage.update({ where: { id: params.id }, data: next })
      // Etapa que vira terminal perde as transições de saída.
      if (terminal && !before.terminal) await tx.stageTransition.deleteMany({ where: { fromStageId: params.id } })
      return s
    })
    await audit({ userId: user.id, acao: 'stage.update', entidade: 'Stage', entidadeId: params.id, valorAnterior: before, valorNovo: next })
    return NextResponse.json({ stage })
  } catch (e) {
    return prismaError(e)
  }
}
