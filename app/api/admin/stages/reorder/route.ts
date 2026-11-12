export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'

const schema = z.object({ preset: z.enum(['v1', 'v2']), ids: z.array(z.string()).min(1) })

// Recebe a lista completa de ids do preset na nova ordem. Usa ordens temporárias negativas
// dentro da transação para não violar o unique (preset, ordem).
export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const parsed = schema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  const { preset, ids } = parsed.data

  const current = await prisma.stage.findMany({ where: { preset }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true } })
  const same = current.length === ids.length && new Set(ids).size === ids.length && current.every((s) => ids.includes(s.id))
  if (!same) return jsonError('A lista deve conter todas as etapas do preset, sem repetição')
  try {
    await prisma.$transaction([
      ...ids.map((id, i) => prisma.stage.update({ where: { id }, data: { ordem: -(i + 1) } })),
      ...ids.map((id, i) => prisma.stage.update({ where: { id }, data: { ordem: i + 1 } })),
    ])
    const nome = new Map(current.map((s) => [s.id, s.nome]))
    await audit({
      userId: user.id,
      acao: 'stage.reorder',
      entidade: 'Stage',
      entidadeId: preset,
      valorAnterior: current.map((s) => s.nome),
      valorNovo: ids.map((id) => nome.get(id)),
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return prismaError(e)
  }
}
