import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface AuditEntry {
  userId?: string | null
  acao: string // ex.: "setting.update", "lead.status", "webhook.leadster"
  entidade: string // ex.: "Setting", "Lead"
  entidadeId?: string | null
  valorAnterior?: unknown
  valorNovo?: unknown
}

const toJson = (v: unknown) =>
  v === undefined ? undefined : v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue)

/** Grava uma linha de auditoria. Nunca lança: falha de auditoria não derruba a operação principal. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        acao: entry.acao,
        entidade: entry.entidade,
        entidadeId: entry.entidadeId ?? null,
        valorAnterior: toJson(entry.valorAnterior),
        valorNovo: toJson(entry.valorNovo),
      },
    })
  } catch (e) {
    console.error('[AUDIT] falha ao gravar:', e)
  }
}
