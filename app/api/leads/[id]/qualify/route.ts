export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { LeadStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'
import { sendQualifiedLeadEvent } from '@/lib/meta-capi'
import { audit } from '@/lib/audit'

const VALID_STATUSES = Object.values(LeadStatus) as string[]

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { status } = (await req.json().catch(() => ({}))) ?? {}
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    // Modo "posterior": evento QualifiedLead só sai se capi_enabled = "true" (null = desligado).
    const metaResult =
      status === 'QUALIFICADO'
        ? await sendQualifiedLeadEvent(lead.id, { phone: lead.phoneNormalized, name: lead.name, externalId: lead.id })
        : null

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: status as LeadStatus,
        statusManual: true, // decisão manual: a reclassificação automática não sobrescreve
        ...(metaResult
          ? {
              metaEventSent: metaResult.success,
              metaEventId: metaResult.eventId,
              metaEventError: metaResult.error ?? null,
              metaEventSentAt: metaResult.success ? new Date() : null,
            }
          : {}),
      },
    })

    await audit({
      userId: user.id,
      acao: 'lead.status',
      entidade: 'Lead',
      entidadeId: lead.id,
      valorAnterior: { status: lead.status },
      valorNovo: { status, capi: metaResult ? metaResult.success : 'desligado' },
    })

    return NextResponse.json({ lead: updated, metaResult })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 })
  }
}
