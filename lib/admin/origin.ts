import { prisma } from '@/lib/prisma'

/** Tipo PARCEIRO exige parceiro ativo; demais tipos não guardam parceiro. Retorna mensagem de erro ou null. */
export async function checkOriginPartner(tipo: string, parceiroId?: string | null): Promise<string | null> {
  if (tipo !== 'PARCEIRO') return null
  if (!parceiroId) return 'Origem do tipo Parceiro exige um parceiro'
  const p = await prisma.partner.findUnique({ where: { id: parceiroId } })
  return p?.ativo ? null : 'Parceiro inexistente ou inativo'
}
