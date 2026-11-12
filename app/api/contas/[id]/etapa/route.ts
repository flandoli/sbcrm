export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import { PipelineError, moverConta } from '@/lib/pipeline'

// Move a conta (oportunidade principal) para outra etapa. Corpo: { toStageId, motivo?, fromStageId? }.
// Grava StageHistory e AuditLog "stage.move". Erros de regra voltam com { error, code }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const body = await readJson<{ toStageId?: string; motivo?: string; fromStageId?: string | null }>(req)
  if (!body.toStageId) return jsonError('Informe a etapa de destino')
  try {
    return NextResponse.json(await moverConta(user, { accountId: params.id, toStageId: body.toStageId, motivo: body.motivo, fromStageId: body.fromStageId }))
  } catch (e) {
    if (e instanceof PipelineError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    return prismaError(e)
  }
}
