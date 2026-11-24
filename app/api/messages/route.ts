export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jsonError, prismaError, readJson, requireUser } from '@/lib/api'
import {
  BROADCAST_ID,
  MAX_BODY_CHARS,
  broadcastUnreadWhere,
  countUnread,
  parseImage,
  userSelect,
} from '@/lib/messages'

const listSelect = {
  id: true,
  fromId: true,
  toId: true,
  body: true,
  imageMime: true,
  readAt: true,
  createdAt: true,
} as const

/**
 * GET /api/messages
 *  - sem parâmetros: conversas do usuário (última mensagem + não lidas), usuários disponíveis e total não lido
 *  - ?userId=<id|todos>: mensagens da conversa (com imagem), em ordem cronológica
 *  - ?count=1: só o total de não lidas (badge do menu)
 */
export async function GET(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const params = new URL(req.url).searchParams

  if (params.get('count')) return NextResponse.json({ unread: await countUnread(prisma, user.id) })

  const partnerId = params.get('userId')
  if (partnerId) {
    const isBroadcast = partnerId === BROADCAST_ID
    const partner = isBroadcast ? null : await prisma.user.findUnique({ where: { id: partnerId }, select: userSelect })
    if (!isBroadcast && !partner) return jsonError('Usuário não encontrado', 404)

    const where = isBroadcast
      ? { toId: null }
      : {
          OR: [
            { fromId: user.id, toId: partnerId },
            { fromId: partnerId, toId: user.id },
          ],
        }
    // Últimas 200 mensagens, devolvidas em ordem cronológica
    const rows = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        from: { select: userSelect },
        reads: { where: { userId: user.id }, select: { readAt: true } },
      },
    })
    const messages = rows.reverse().map(({ reads, ...m }) => ({
      ...m,
      // Para broadcast, "lida" é por usuário
      readAt: m.toId === null ? (m.fromId === user.id ? m.createdAt : reads[0]?.readAt ?? null) : m.readAt,
      mine: m.fromId === user.id,
    }))
    return NextResponse.json({ partner: isBroadcast ? { id: BROADCAST_ID, name: 'Todos' } : partner, messages })
  }

  // Lista de conversas
  const [direct, lastBroadcast, broadcastUnread, users] = await Promise.all([
    prisma.message.findMany({
      where: { OR: [{ fromId: user.id }, { toId: user.id }], NOT: { toId: null } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: listSelect,
    }),
    prisma.message.findFirst({
      where: { toId: null },
      orderBy: { createdAt: 'desc' },
      select: { ...listSelect, from: { select: userSelect } },
    }),
    prisma.message.count({ where: broadcastUnreadWhere(user.id) }),
    prisma.user.findMany({
      where: { ativo: true, id: { not: user.id } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: userSelect,
    }),
  ])

  const byPartner = new Map<string, { last: (typeof direct)[number]; unread: number }>()
  for (const m of direct) {
    const pid = m.fromId === user.id ? m.toId! : m.fromId
    const entry = byPartner.get(pid) ?? { last: m, unread: 0 }
    if (m.toId === user.id && !m.readAt) entry.unread++
    byPartner.set(pid, entry)
  }

  // Parceiros que não estão na lista de ativos (ex.: desativados) ainda aparecem no histórico
  const known = new Map(users.map((u) => [u.id, u]))
  const missing = Array.from(byPartner.keys()).filter((id) => !known.has(id))
  if (missing.length) {
    for (const u of await prisma.user.findMany({ where: { id: { in: missing } }, select: userSelect })) known.set(u.id, u)
  }

  const conversations = Array.from(byPartner.entries())
    .filter(([pid]) => known.has(pid))
    .map(([pid, { last, unread }]) => ({
      partner: known.get(pid)!,
      lastMessage: { ...last, hasImage: !!last.imageMime, mine: last.fromId === user.id },
      unread,
    }))

  if (lastBroadcast) {
    const { from, ...last } = lastBroadcast
    conversations.push({
      partner: { id: BROADCAST_ID, name: 'Todos', email: '', papel: null as any },
      lastMessage: { ...last, hasImage: !!last.imageMime, mine: last.fromId === user.id, fromName: from.name ?? from.email } as any,
      unread: broadcastUnread,
    })
  }
  conversations.sort((a, b) => +new Date(b.lastMessage.createdAt) - +new Date(a.lastMessage.createdAt))

  const unread = conversations.reduce((s, c) => s + c.unread, 0)
  return NextResponse.json({ conversations, users, unread })
}

/** POST /api/messages — { toId?: string|null|"todos", body: string, imageData?: string, imageMime?: string } */
export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const input = await readJson<{ toId?: string | null; body?: string; imageData?: string; imageMime?: string }>(req)

  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (body.length > MAX_BODY_CHARS) return jsonError(`Mensagem acima de ${MAX_BODY_CHARS} caracteres`)

  const image = parseImage(input.imageData, input.imageMime)
  if (typeof image === 'string') return jsonError(image)
  if (!body && !image) return jsonError('Escreva uma mensagem ou anexe uma imagem')

  const toId = input.toId && input.toId !== BROADCAST_ID ? String(input.toId) : null
  if (toId) {
    if (toId === user.id) return jsonError('Não é possível enviar mensagem para si mesmo')
    const dest = await prisma.user.findUnique({ where: { id: toId }, select: { ativo: true } })
    if (!dest) return jsonError('Destinatário não encontrado', 404)
    if (!dest.ativo) return jsonError('Destinatário está desativado')
  }

  try {
    const msg = await prisma.message.create({
      data: { fromId: user.id, toId, body, imageData: image?.data ?? null, imageMime: image?.mime ?? null },
      include: { from: { select: userSelect } },
    })
    return NextResponse.json({ ...msg, mine: true }, { status: 201 })
  } catch (e) {
    return prismaError(e)
  }
}
