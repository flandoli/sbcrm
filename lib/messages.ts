import type { Prisma } from '@prisma/client'

/** Id virtual da conversa "Todos" (mensagens com toId nulo). */
export const BROADCAST_ID = 'todos'

/** Limite de imagem: 2 MB de binário (base64 ocupa ~4/3 disso). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_BODY_CHARS = 5000
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export const userSelect = { id: true, name: true, email: true, papel: true } satisfies Prisma.UserSelect

/** Broadcast não lido pelo usuário: enviado por outra pessoa e sem MessageRead dele. */
export const broadcastUnreadWhere = (userId: string): Prisma.MessageWhereInput => ({
  toId: null,
  fromId: { not: userId },
  reads: { none: { userId } },
})

/** Total de não lidas do usuário (1:1 + broadcast). */
export async function countUnread(prisma: Prisma.TransactionClient, userId: string) {
  const [direct, broadcast] = await Promise.all([
    prisma.message.count({ where: { toId: userId, readAt: null } }),
    prisma.message.count({ where: broadcastUnreadWhere(userId) }),
  ])
  return direct + broadcast
}

/** Valida e normaliza a imagem (aceita "data:image/png;base64,..." ou base64 puro). */
export function parseImage(imageData?: unknown, imageMime?: unknown): { data: string; mime: string } | string | null {
  if (imageData == null || imageData === '') return null
  if (typeof imageData !== 'string') return 'Imagem inválida'
  let data = imageData.trim()
  let mime = typeof imageMime === 'string' ? imageMime.trim().toLowerCase() : ''
  const m = data.match(/^data:([^;]+);base64,(.*)$/s)
  if (m) {
    mime = mime || m[1].toLowerCase()
    data = m[2]
  }
  data = data.replace(/\s/g, '')
  if (!IMAGE_MIMES.includes(mime)) return 'Formato de imagem não suportado (use JPEG, PNG, GIF ou WebP)'
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return 'Imagem inválida'
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
  if (bytes > MAX_IMAGE_BYTES) return 'Imagem acima de 2 MB'
  return { data, mime }
}
