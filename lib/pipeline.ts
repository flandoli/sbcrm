// Pipeline de CONTAS: a posição da conta no Kanban é a etapa da sua oportunidade principal
// (a aberta mais recente do preset ativo; sem aberta, a mais recente do preset). Não há etapa duplicada em Account.
import type { Opportunity, Papel, Prisma, Stage } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/lib/session'
import { accountScope, exigeCnpjReal } from '@/lib/accounts'
import { getFunnelPreset } from '@/lib/settings'

export const VER_TODAS: Papel[] = ['ADMIN', 'DIRETOR', 'GERENTE']

export class PipelineError extends Error {
  constructor(message: string, public status = 400, public code?: 'CNPJ_PROVISORIO' | 'MOTIVO_OBRIGATORIO' | 'TRANSICAO' | 'CONFLITO') {
    super(message)
  }
}

type OppLite = Pick<Opportunity, 'id' | 'stageId' | 'resultado' | 'createdAt'>

/** Escolhe a oportunidade principal entre as do preset ativo. */
export function oportunidadePrincipal<T extends OppLite>(opps: T[]): T | null {
  const ordenadas = [...opps].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return ordenadas.find((o) => o.resultado === null) ?? ordenadas[0] ?? null
}

/** Transições do preset liberadas ao papel. `livre` = nenhum grafo configurado → qualquer movimento vale. */
export async function transicoesDoPapel(preset: string, papel: Papel) {
  const todas = await prisma.stageTransition.findMany({
    where: { toStage: { preset } },
    select: { fromStageId: true, toStageId: true, papeis: true },
  })
  return {
    livre: todas.length === 0,
    permitidas: todas
      .filter((t) => t.fromStageId !== null && (t.papeis.length === 0 || t.papeis.includes(papel)))
      .map((t) => ({ fromStageId: t.fromStageId as string, toStageId: t.toStageId })),
  }
}

export interface MoverInput {
  accountId: string
  toStageId: string
  motivo?: string | null
  fromStageId?: string | null // etapa vista pelo cliente; diverge → conflito
}

/** Move a conta (sua oportunidade principal) de etapa. Valida escopo, grafo, motivo de perda e CNPJ provisório. */
export async function moverConta(user: SessionUser, input: MoverInput) {
  const preset = await getFunnelPreset()
  const conta = await prisma.account.findFirst({
    where: { AND: [{ id: input.accountId }, accountScope(user)] },
    select: {
      id: true, razaoSocial: true, cnpjProvisorio: true, responsavelId: true,
      oportunidades: { where: { stage: { preset } }, select: { id: true, stageId: true, resultado: true, createdAt: true, motivoPerda: true } },
    },
  })
  if (!conta) throw new PipelineError('Conta não encontrada', 404)

  const destino = await prisma.stage.findFirst({ where: { id: input.toStageId, preset, ativo: true } })
  if (!destino) throw new PipelineError('Etapa de destino inválida para o funil ativo')

  const opp = oportunidadePrincipal(conta.oportunidades)
  const origemId = opp?.stageId ?? null
  if (input.fromStageId !== undefined && input.fromStageId !== null && input.fromStageId !== origemId)
    throw new PipelineError('A conta mudou de etapa enquanto você olhava. Recarregue o quadro.', 409, 'CONFLITO')
  if (origemId === destino.id) throw new PipelineError('A conta já está nessa etapa')

  const stages = await prisma.stage.findMany({ where: { preset }, select: { id: true, nome: true } })
  const nome = (id: string | null) => (id ? stages.find((s) => s.id === id)?.nome ?? '?' : '(sem oportunidade)')

  // Grafo de transições configurado no Admin (sem oportunidade = entrada no funil: liberada).
  if (origemId) {
    const { livre, permitidas } = await transicoesDoPapel(preset, user.papel)
    if (!livre && !permitidas.some((t) => t.fromStageId === origemId && t.toStageId === destino.id))
      throw new PipelineError(`Movimento não permitido: de "${nome(origemId)}" para "${destino.nome}" não está liberado no funil.`, 422, 'TRANSICAO')
  }

  if (destino.resultado === 'FECHADO') {
    const bloqueio = exigeCnpjReal(conta, 'mover para Fechamento')
    if (bloqueio) throw new PipelineError(bloqueio, 422, 'CNPJ_PROVISORIO')
  }
  const motivo = input.motivo?.trim() || null
  if (destino.resultado === 'PERDIDO' && !motivo)
    throw new PipelineError('Informe o motivo da perda.', 422, 'MOTIVO_OBRIGATORIO')

  const dados: Prisma.OpportunityUncheckedUpdateInput = {
    stageId: destino.id,
    resultado: destino.resultado ?? null,
    motivoPerda: destino.resultado === 'PERDIDO' ? motivo : null,
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const oportunidade = opp
      ? await tx.opportunity.update({ where: { id: opp.id }, data: dados })
      : await tx.opportunity.create({
          data: { accountId: conta.id, responsavelId: conta.responsavelId, stageId: destino.id, resultado: destino.resultado ?? null, motivoPerda: dados.motivoPerda as string | null },
        })
    await tx.stageHistory.create({ data: { opportunityId: oportunidade.id, fromStageId: origemId, toStageId: destino.id, userId: user.id } })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        acao: 'stage.move',
        entidade: 'Opportunity',
        entidadeId: oportunidade.id,
        valorAnterior: { accountId: conta.id, stageId: origemId, etapa: nome(origemId), resultado: opp?.resultado ?? null, motivoPerda: opp?.motivoPerda ?? null },
        valorNovo: { accountId: conta.id, stageId: destino.id, etapa: destino.nome, resultado: destino.resultado ?? null, motivo },
      },
    })
    return oportunidade
  })
  return { accountId: conta.id, opportunityId: resultado.id, stageId: destino.id, resultado: resultado.resultado }
}

export type StageLite = Pick<Stage, 'id' | 'nome' | 'ordem' | 'terminal' | 'resultado'>
