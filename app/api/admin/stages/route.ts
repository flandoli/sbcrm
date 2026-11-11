export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { getFunnelPreset } from '@/lib/settings'
import { listTransitions } from '@/lib/admin/funnel'

const presetSchema = z.enum(['v1', 'v2'])

// GET ?preset=v1|v2 (padrão: preset ativo) → etapas + transições + contagem de oportunidades abertas por etapa.
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const ativo = await getFunnelPreset()
  const p = presetSchema.safeParse(new URL(req.url).searchParams.get('preset'))
  const preset = p.success ? p.data : ativo
  const [stages, transitions, abertas] = await Promise.all([
    prisma.stage.findMany({ where: { preset }, orderBy: { ordem: 'asc' } }),
    listTransitions(prisma, preset),
    prisma.opportunity.groupBy({ by: ['stageId'], where: { resultado: null, stage: { preset } }, _count: true }),
  ])
  const abertasPorEtapa = Object.fromEntries(abertas.map((a) => [a.stageId, a._count]))
  return NextResponse.json({ preset, presetAtivo: ativo, stages, transitions, abertasPorEtapa })
}

const createSchema = z
  .object({
    preset: presetSchema,
    nome: z.string().trim().min(2, 'Nome obrigatório').max(60),
    terminal: z.boolean().default(false),
    resultado: z.enum(['FECHADO', 'PERDIDO']).nullable().default(null),
  })
  .refine((d) => !d.resultado || d.terminal, { message: 'Resultado só se aplica a etapa terminal' })
  .refine((d) => !d.terminal || d.resultado, { message: 'Etapa terminal precisa de resultado (Fechado ou Perdido)' })

export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = createSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const d = parsed.data
  try {
    const max = await prisma.stage.aggregate({ where: { preset: d.preset }, _max: { ordem: true } })
    const stage = await prisma.stage.create({ data: { ...d, ordem: (max._max.ordem ?? 0) + 1 } })
    await audit({ userId: user.id, acao: 'stage.create', entidade: 'Stage', entidadeId: stage.id, valorNovo: stage })
    return NextResponse.json({ stage }, { status: 201 })
  } catch (e) {
    return prismaError(e)
  }
}
