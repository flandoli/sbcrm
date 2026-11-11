export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { excludedMidiaWhere } from '@/lib/sales-utils'

const CHANNEL_LABELS: Record<string, string> = {
  pago_meta: 'Meta Ads',
  pago_google: 'Google Ads',
  pago_outro: 'Midia Paga',
  organico: 'Organico',
  direto: 'Direto',
}

function formatDateBR(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

function buildPhone(phoneNormalized: string | null, phoneRaw: string): string {
  if (phoneNormalized) return `+${phoneNormalized}`
  const raw = phoneRaw.replace(/\D/g, '')
  if (!raw) return ''
  return raw.startsWith('55') ? `+${raw}` : `+55${raw}`
}

/** Escapa campo CSV: aspas duplas, vírgulas, quebras de linha */
function csvField(val: string): string {
  if (!val) return ''
  if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  const where: any = { AND: [excludedMidiaWhere] }
  if (dateFrom || dateTo) {
    where.dataMatricula = {}
    if (dateFrom) where.dataMatricula.gte = new Date(dateFrom + 'T00:00:00-03:00')
    if (dateTo) where.dataMatricula.lte = new Date(dateTo + 'T23:59:59.999-03:00')
  }

  const sales = await prisma.sale.findMany({
    where,
    orderBy: [{ dataMatricula: 'desc' }, { createdAt: 'desc' }],
    include: {
      lead: {
        select: {
          channel: true,
          campaignName: true,
          utmCampaign: true,
          adTitle: true,
          source: true,
        },
      },
    },
  })

  // Cabeçalho CSV
  const headers = [
    'Email',
    'Phone',
    'First Name',
    'Last Name',
    'Tags',
    // Custom fields (serão mapeados manualmente no AC)
    'Curso',
    'Valor Pago',
    'Forma Pagamento',
    'Data Matricula',
    'Matricula',
    'UF',
    'DDD',
    'Midia',
    'Canal Aquisicao',
    'Campanha',
  ]

  const rows: string[] = [headers.map(csvField).join(',')]

  for (const sale of sales) {
    // Montar tags
    const tags: string[] = ['cliente']
    if (sale.curso) tags.push(`curso:${sale.curso.trim()}`)
    if (sale.lead?.channel) {
      const label = CHANNEL_LABELS[sale.lead.channel] || sale.lead.channel
      tags.push(`canal:${label}`)
    }
    if (sale.matched) tags.push('lead_casado')
    if (sale.midia) tags.push(`midia:${sale.midia.trim()}`)

    // Separar nome em first/last
    const fullName = (sale.nome || '').trim()
    const parts = fullName.split(/\s+/)
    const firstName = parts[0] || ''
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : ''

    // Telefone
    const phone = buildPhone(sale.phoneNormalized, sale.phoneRaw)

    // Canal de aquisição
    const canal = sale.lead?.channel
      ? CHANNEL_LABELS[sale.lead.channel] || sale.lead.channel
      : sale.midia || ''

    // Campanha
    const campanha = sale.lead?.utmCampaign || sale.lead?.campaignName || ''

    const row = [
      csvField(sale.email || ''),
      csvField(phone),
      csvField(firstName),
      csvField(lastName),
      csvField(tags.join(', ')),
      csvField(sale.curso || ''),
      sale.valorPago ? String(sale.valorPago) : '',
      csvField(sale.formaPgto || ''),
      csvField(formatDateBR(sale.dataMatricula)),
      csvField(sale.matricula),
      csvField(sale.uf || ''),
      csvField(sale.ddd || ''),
      csvField(sale.midia || ''),
      csvField(canal),
      csvField(campanha),
    ]

    rows.push(row.join(','))
  }

  // BOM para Excel/AC reconhecer UTF-8
  const bom = '\uFEFF'
  const csv = bom + rows.join('\r\n')

  const today = new Date()
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .replace(/\//g, '-')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendas_activecampaign_${today}.csv"`,
    },
  })
}
