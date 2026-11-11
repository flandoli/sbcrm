export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { sendQualifiedLeadEvent } from '@/lib/meta-capi'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { status } = body ?? {}

    const validStatuses = ['NOVO', 'QUALIFICADO', 'SEM_INTERESSE', 'DDD_INDESEJADO', 'DDI_INDESEJADO', 'INVALIDO']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    let metaResult: any = null

    // Only send to Meta if qualifying as QUALIFICADO AND lead is NOT aluno
    if (status === 'QUALIFICADO' && lead.phoneNormalized && !lead.isAluno) {
      metaResult = await sendQualifiedLeadEvent(lead.id, { phone: lead.phoneNormalized, name: lead.name, externalId: lead.id })

      await prisma.lead.update({
        where: { id: params.id },
        data: {
          status: 'QUALIFICADO',
          metaEventSent: metaResult.success,
          metaEventId: metaResult.eventId,
          metaEventError: metaResult.error ?? null,
          metaEventSentAt: metaResult.success ? new Date() : null,
        },
      })
    } else if (status === 'QUALIFICADO' && lead.isAluno) {
      // Aluno: atualiza status mas NÃO envia conversão à Meta
      await prisma.lead.update({
        where: { id: params.id },
        data: { status: 'QUALIFICADO' },
      })
    } else {
      await prisma.lead.update({
        where: { id: params.id },
        data: { status },
      })
    }

    const updated = await prisma.lead.findUnique({ where: { id: params.id } })

    return NextResponse.json({ lead: updated, metaResult })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 })
  }
}
