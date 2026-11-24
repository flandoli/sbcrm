export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jsonError, requireUser } from '@/lib/api'

/** PATCH /api/messages/[id]/read — marca como lida; só o destinatário pode (no broadcast, qualquer um menos o remetente). */
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const msg = await prisma.message.findUnique({ where: { id: params.id }, select: { id: true, fromId: true, toId: true, readAt: true } })
  if (!msg) return jsonError('Mensagem não encontrada', 404)

  if (msg.toId === null) {
    if (msg.fromId === user.id) return jsonError('O remetente não marca a própria mensagem', 403)
    const read = await prisma.messageRead.upsert({
      where: { messageId_userId: { messageId: msg.id, userId: user.id } },
      update: {},
      create: { messageId: msg.id, userId: user.id },
    })
    return NextResponse.json({ id: msg.id, readAt: read.readAt })
  }

  if (msg.toId !== user.id) return jsonError('Apenas o destinatário pode marcar como lida', 403)
  if (msg.readAt) return NextResponse.json({ id: msg.id, readAt: msg.readAt })
  const updated = await prisma.message.update({ where: { id: msg.id }, data: { readAt: new Date() }, select: { id: true, readAt: true } })
  return NextResponse.json(updated)
}
