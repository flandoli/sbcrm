export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Papel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { buildDefaultTransitions, listTransitions, replaceTransitions } from '@/lib/admin/funnel'

const papel = z.enum(['ADMIN', 'DIRETOR', 'GERENTE', 'VENDEDOR'])
const schema = z.union([
  z.object({ preset: z.enum(['v1', 'v2']), reset: z.literal(true) }),
  z.object({
    preset: z.enum(['v1', 'v2']),
    transitions: z.array(z.object({ fromStageId: z.string().nullable(), toStageId: z.string(), papeis: z.array(papel).min(1) })),
  }),
])

// Substitui o grafo de transições do preset (ou restaura o padrão com reset=true).
export async function PUT(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = schema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const { preset } = parsed.data

  let items: { fromStageId: string | null; toStageId: string; papeis: Papel[] }[]
  if ('reset' in parsed.data) {
    items = await buildDefaultTransitions(prisma, preset)
  } else {
    const stages = await prisma.stage.findMany({ where: { preset } })
    const byId = new Map(stages.map((s) => [s.id, s]))
    const seen = new Set<string>()
    for (const t of parsed.data.transitions) {
      const to = byId.get(t.toStageId)
      const from = t.fromStageId ? byId.get(t.fromStageId) : null
      if (!to || (t.fromStageId && !from)) return jsonError('Transição com etapa de outro preset ou inexistente')
      if (from?.terminal) return jsonError(`"${from.nome}" é terminal e não pode ter transições de saída`)
      if (t.fromStageId === t.toStageId) return jsonError('Transição para a própria etapa não é permitida')
      const key = `${t.fromStageId}>${t.toStageId}`
      if (seen.has(key)) return jsonError('Transição repetida')
      seen.add(key)
    }
    if (!parsed.data.transitions.some((t) => t.fromStageId === null)) return jsonError('Defina ao menos uma etapa de entrada')
    items = parsed.data.transitions.map((t) => ({ ...t, papeis: Array.from(new Set(t.papeis)) }))
  }

  try {
    const before = await listTransitions(prisma, preset)
    await prisma.$transaction((tx) => replaceTransitions(tx, preset, items))
    const after = await listTransitions(prisma, preset)
    await audit({
      userId: user.id,
      acao: 'reset' in parsed.data ? 'transition.reset' : 'transition.replace',
      entidade: 'StageTransition',
      entidadeId: preset,
      valorAnterior: before.map(({ fromStageId, toStageId, papeis }) => ({ fromStageId, toStageId, papeis })),
      valorNovo: after.map(({ fromStageId, toStageId, papeis }) => ({ fromStageId, toStageId, papeis })),
    })
    return NextResponse.json({ transitions: after })
  } catch (e) {
    return prismaError(e)
  }
}
