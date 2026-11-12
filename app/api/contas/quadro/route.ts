export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/api'
import { accountScope, cnpjCompleto, filtroContas } from '@/lib/accounts'
import { getFunnelPreset } from '@/lib/settings'
import { VER_TODAS, oportunidadePrincipal, transicoesDoPapel } from '@/lib/pipeline'

// Quadro Kanban de contas agrupado pelas etapas do preset ativo. Aceita os mesmos filtros de /api/contas.
// Conta sem oportunidade no preset ativo aparece na 1ª etapa (semOportunidade = true); mover cria a oportunidade.
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const params = new URL(req.url).searchParams
  const preset = await getFunnelPreset()
  const podeVerTodas = VER_TODAS.includes(user.papel)

  const [stages, grafo, contas, totalProvisorio, responsaveis] = await Promise.all([
    prisma.stage.findMany({
      where: { preset, ativo: true },
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, ordem: true, terminal: true, resultado: true },
    }),
    transicoesDoPapel(preset, user.papel),
    prisma.account.findMany({
      where: filtroContas(user, params),
      orderBy: { razaoSocial: 'asc' },
      take: 1000,
      select: {
        id: true, razaoSocial: true, nomeFantasia: true, cnpjRaiz: true, cnpjEstabelecimento: true, cnpjDv: true,
        cnpjProvisorio: true, segmento: true, statusConta: true,
        responsavel: { select: { id: true, name: true, email: true } },
        origem: { select: { nome: true } },
        oportunidades: { where: { stage: { preset } }, select: { id: true, stageId: true, resultado: true, motivoPerda: true, createdAt: true, updatedAt: true } },
        _count: { select: { pessoas: true, notas: true } },
      },
    }),
    prisma.account.count({ where: { AND: [accountScope(user), { cnpjProvisorio: true }] } }),
    podeVerTodas
      ? prisma.user.findMany({
          where: { contas: { some: accountScope(user) } },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
  ])

  const primeira = stages.find((s) => !s.terminal) ?? stages[0]
  const ids = new Set(stages.map((s) => s.id))
  const cartoes = contas.map(({ cnpjRaiz, cnpjEstabelecimento, cnpjDv, oportunidades, ...c }) => {
    const opp = oportunidadePrincipal(oportunidades)
    return {
      ...c,
      cnpj: cnpjCompleto({ cnpjRaiz, cnpjEstabelecimento, cnpjDv }),
      opportunityId: opp?.id ?? null,
      // Etapa desativada no Admin cai na 1ª coluna para não sumir do quadro.
      stageId: opp && ids.has(opp.stageId) ? opp.stageId : primeira?.id ?? null,
      semOportunidade: !opp,
      motivoPerda: opp?.motivoPerda ?? null,
      atualizadoEm: opp?.updatedAt ?? null,
    }
  })

  return NextResponse.json({
    preset,
    stages,
    transicoes: grafo,
    contas: cartoes,
    totalProvisorio,
    podeVerTodas,
    responsaveis,
  })
}
