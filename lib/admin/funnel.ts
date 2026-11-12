// Helpers do funil compartilhados entre APIs e seed (imports relativos para rodar via tsx).
import type { Prisma, PrismaClient } from '@prisma/client'
import { ALL_PAPEIS, PRESET_STAGES, defaultTransitions, type PresetId } from '../funnel-presets'

type Db = PrismaClient | Prisma.TransactionClient

/** Cria as etapas do preset se ainda não houver nenhuma. Retorna quantas criou. */
export async function ensurePresetStages(db: Db, preset: PresetId): Promise<number> {
  if (await db.stage.count({ where: { preset } })) return 0
  const defs = PRESET_STAGES[preset]
  await db.stage.createMany({
    data: defs.map((s, i) => ({ preset, nome: s.nome, ordem: i + 1, terminal: !!s.terminal, resultado: s.resultado ?? null })),
  })
  return defs.length
}

/** Monta as transições padrão do preset resolvendo nomes → ids (ignora etapas renomeadas/inexistentes). */
export async function buildDefaultTransitions(db: Db, preset: PresetId) {
  const stages = await db.stage.findMany({ where: { preset }, select: { id: true, nome: true } })
  const byName = new Map(stages.map((s) => [s.nome, s.id]))
  return defaultTransitions(preset)
    .filter((t) => byName.has(t.to) && (t.from === null || byName.has(t.from)))
    .map((t) => ({ fromStageId: t.from === null ? null : byName.get(t.from)!, toStageId: byName.get(t.to)!, papeis: ALL_PAPEIS }))
}

/** Transições atuais do preset (identificadas pela etapa de destino). */
export function listTransitions(db: Db, preset: string) {
  return db.stageTransition.findMany({
    where: { toStage: { preset } },
    select: { id: true, fromStageId: true, toStageId: true, papeis: true },
  })
}

/** Substitui todo o grafo de transições do preset. */
export async function replaceTransitions(
  db: Db,
  preset: string,
  items: { fromStageId: string | null; toStageId: string; papeis: Prisma.StageTransitionCreateManyInput['papeis'] }[],
) {
  await db.stageTransition.deleteMany({ where: { toStage: { preset } } })
  if (items.length) await db.stageTransition.createMany({ data: items })
}
