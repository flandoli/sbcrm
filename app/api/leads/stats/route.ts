export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { untaggedMetaWhere } from '@/lib/meta-tag-utils'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  // Filtro de período (fuso de São Paulo, UTC-3). Sem datas => todo o período.
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom + 'T00:00:00-03:00')
  if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59.999-03:00')
  const hasDate = Boolean(dateFrom || dateTo)
  const dw: any = hasDate ? { createdAt: dateFilter } : {}

  // Helper: combina o filtro de período com filtros adicionais.
  const w = (extra: any = {}) => (hasDate ? { AND: [{ createdAt: dateFilter }, extra] } : extra)

  const [
    total,
    qualificados,
    semInteresse,
    dddIndesejado,
    ddiIndesejado,
    invalidos,
    novos,
    totalAll,
    novosContatos,
    outrosContatos,
    derrubados,
    fromAds,
    fromOpasuite,
    fromLeadster,
    alunos,
    metaSemEtiqueta,
    ssrjTotal,
    viraTecnicoTotal,
    fromVaicrm,
  ] = await Promise.all([
    prisma.lead.count({ where: dw }),
    prisma.lead.count({ where: w({ status: 'QUALIFICADO' }) }),
    prisma.lead.count({ where: w({ status: 'SEM_INTERESSE' }) }),
    prisma.lead.count({ where: w({ status: 'DDD_INDESEJADO' }) }),
    prisma.lead.count({ where: w({ status: 'DDI_INDESEJADO' }) }),
    prisma.lead.count({ where: w({ status: 'INVALIDO' }) }),
    prisma.lead.count({ where: w({ status: 'NOVO' }) }),
    prisma.lead.count(), // all-time (header + notificação de novos leads)
    prisma.lead.count({ where: w({ isNewConversation: true, isDropped: false, isAluno: false }) }),
    prisma.lead.count({ where: w({ isDropped: false, OR: [{ isNewConversation: false }, { isAluno: true }] }) }),
    prisma.lead.count({ where: w({ isDropped: true }) }),
    prisma.lead.count({ where: w({ adId: { not: null }, isAluno: false }) }),
    prisma.lead.count({ where: w({ source: 'opasuite' }) }),
    prisma.lead.count({ where: w({ source: 'leadster' }) }),
    prisma.lead.count({ where: w({ status: 'ALUNO' }) }),
    prisma.lead.count({ where: hasDate ? { AND: [{ createdAt: dateFilter }, untaggedMetaWhere()] } : untaggedMetaWhere() }),
    prisma.lead.count({ where: w({ ssrj: true }) }),
    prisma.lead.count({ where: w({ viraTecnico: true }) }),
    prisma.lead.count({ where: w({ vaicrmContactId: { not: null } }) }),
  ])

  return NextResponse.json({
    total,
    qualificados,
    semInteresse,
    dddIndesejado,
    ddiIndesejado,
    invalidos,
    novos,
    totalAll,
    novosContatos,
    outrosContatos,
    derrubados,
    fromAds,
    fromOpasuite,
    fromLeadster,
    alunos,
    metaSemEtiqueta,
    ssrjTotal,
    viraTecnicoTotal,
    fromVaicrm,
  })
}
