export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { getFunnelPreset } from '@/lib/settings'
import { conversionSchema } from '@/lib/admin/schemas'

// Índice de conversão por etapa × segmento (meta global: userId null). Cada alteração é uma nova linha:
// o valor vigente é o mais recente e as linhas anteriores formam o histórico auditável.
export async function GET() {
  const user = await requireUser('ADMIN', 'DIRETOR', 'GERENTE')
  if (user instanceof NextResponse) return user
  const preset = await getFunnelPreset()
  const stages = await prisma.stage.findMany({
    where: { preset, ativo: true, terminal: false },
    orderBy: { ordem: 'asc' },
    select: { id: true, nome: true },
  })
  const rows = await prisma.stageConversionRate.findMany({
    where: { userId: null, stageId: { in: stages.map((s) => s.id) } },
    orderBy: { setadoEm: 'desc' },
    include: { setter: { select: { name: true, email: true } } },
  })
  const vigentes: Record<string, number> = {}
  for (const r of rows) {
    const k = `${r.stageId}:${r.segmento ?? 'TODOS'}`
    if (!(k in vigentes)) vigentes[k] = Number(r.taxa) * 100
  }
  const historico = rows.slice(0, 100).map((r) => ({
    id: r.id,
    stageId: r.stageId,
    segmento: r.segmento,
    taxaPorc: Number(r.taxa) * 100,
    setadoEm: r.setadoEm,
    setadoPor: r.setter.name ?? r.setter.email,
  }))
  return NextResponse.json({ preset, stages, vigentes, historico })
}

// POST { items: [{ stageId, segmento, taxaPorc (0–100) }] } — grava só o que mudou. Diretor e Admin.
export async function POST(req: Request) {
  const user = await requireUser('ADMIN', 'DIRETOR')
  if (user instanceof NextResponse) return user
  const parsed = conversionSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(parsed.error.issues[0].message)
  try {
    let alterados = 0
    for (const { stageId, segmento, taxaPorc } of parsed.data.items) {
      const stage = await prisma.stage.findUnique({ where: { id: stageId } })
      if (!stage) return jsonError('Etapa não encontrada', 404)
      const atual = await prisma.stageConversionRate.findFirst({ where: { stageId, segmento, userId: null }, orderBy: { setadoEm: 'desc' } })
      const anterior = atual ? Math.round(Number(atual.taxa) * 10000) / 100 : null
      const novo = Math.round(taxaPorc * 100) / 100
      if (anterior === novo) continue
      const row = await prisma.stageConversionRate.create({ data: { stageId, segmento, taxa: novo / 100, setadoPor: user.id } })
      alterados++
      await audit({
        userId: user.id,
        acao: 'conversion.update',
        entidade: 'StageConversionRate',
        entidadeId: row.id,
        valorAnterior: { etapa: stage.nome, segmento, taxaPorc: anterior },
        valorNovo: { etapa: stage.nome, segmento, taxaPorc: novo },
      })
    }
    return NextResponse.json({ success: true, alterados })
  } catch (e) {
    return prismaError(e)
  }
}
