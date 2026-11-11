export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { getAdPerformance } from '@/lib/ad-performance'
import { untaggedMetaWhere } from '@/lib/meta-tag-utils'

const TRACKING_START_DATE = '2026-07-31'

const STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  QUALIFICADO: 'Qualificado',
  SEM_INTERESSE: 'Sem Interesse',
  DDD_INDESEJADO: 'DDD Indesejado',
  DDI_INDESEJADO: 'DDI Indesejado',
  INVALIDO: 'Inválido',
  ALUNO: 'Aluno',
}

const CHANNEL_LABELS: Record<string, string> = {
  pago_meta: 'Meta Ads',
  pago_google: 'Google Ads',
  pago_outro: 'Mídia Paga',
  organico: 'Orgânico',
  direto: 'Direto',
  http: 'Site',
}

function formatDateBR(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function buildPhone(lead: any): string {
  // phoneNormalized já inclui o DDI (ex.: "5511974405071"), então basta prefixar "+".
  const norm = lead.phoneNormalized ?? ''
  if (norm) return `+${norm}`
  // Fallback: número cru + DDI apenas quando não houver normalizado.
  const ddi = lead.ddi ?? ''
  const raw = (lead.phoneRaw ?? '').replace(/\D/g, '')
  if (!raw) return ''
  return raw.startsWith(ddi) ? `+${raw}` : `+${ddi}${raw}`
}

function formatDuration(a: Date | null, b: Date | null): string {
  if (!a || !b) return ''
  const ms = b.getTime() - a.getTime()
  if (ms < 0 || isNaN(ms)) return ''
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

const SALE_TAG_LABELS: Record<string, string> = {
  'matrícula': 'Matrícula (fechamento)',
  'pós-matrícula': 'Pós-matrícula',
  'lead quente': 'Lead Quente',
  'curso técnico': 'Curso Técnico',
}

function saleStatusText(tagsJson: string | null | undefined): string {
  if (!tagsJson) return ''
  let tags: string[] = []
  try { const a = JSON.parse(tagsJson); if (Array.isArray(a)) tags = a.filter((t) => typeof t === 'string') } catch { return '' }
  if (tags.length === 0) return ''
  return tags.map((t) => SALE_TAG_LABELS[t.trim().toLowerCase()] ?? t).join(', ')
}

function sourceLabel(source: string): string {
  if (source === 'leadster') return 'Leadster'
  if (source === 'vaivendas') return 'VCRM'
  return 'OpaSuite'
}

function mapRow(lead: any) {
  return {
    'Nome': lead.name ?? '',
    'Telefone Completo': buildPhone(lead),
    'DDI': lead.ddi ? `+${lead.ddi}` : '',
    'DDD': lead.ddd ?? '',
    'Status': STATUS_LABELS[lead.status] ?? lead.status,
    'Fonte': sourceLabel(lead.source),
    'Canal': CHANNEL_LABELS[lead.channel ?? ''] ?? '',
    'Etapa (VCRM)': lead.vaicrmStage ?? '',
    'Situação de venda (VCRM)': saleStatusText(lead.vaicrmTags),
    'Valor (VCRM)': typeof lead.vaicrmSalesValue === 'number' && lead.vaicrmSalesValue > 0 ? Number(lead.vaicrmSalesValue.toFixed(2)) : '',
    'Vira Técnico': lead.viraTecnico ? 'Sim' : 'Não',
    'Anúncio': lead.adTitle ?? '',
    'Campanha': lead.campaignName ?? '',
    'Aluno': lead.isAluno ? 'Sim' : 'Não',
    'Não é Aluno': lead.isNotAluno ? 'Sim' : 'Não',
    'Meta Enviado': lead.metaEventSent ? 'Sim' : 'Não',
    'Abertura Atend.': formatDateBR(lead.openedAt),
    'Assumido em': formatDateBR(lead.assumedAt),
    'Encerramento Atend.': formatDateBR(lead.closedAt),
    'Espera (Abert.→Assumido)': lead.assumedAt && lead.openedAt &&
      (!lead.closedAt || lead.assumedAt.getTime() <= lead.closedAt.getTime())
        ? formatDuration(lead.openedAt, lead.assumedAt) : '',
    'Duração Atend.': lead.assumedAt && lead.closedAt &&
      lead.assumedAt.getTime() <= lead.closedAt.getTime()
        ? formatDuration(lead.assumedAt, lead.closedAt)
        : formatDuration(lead.openedAt, lead.closedAt),
    'Recebido em': formatDateBR(lead.createdAt),
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const ddd = url.searchParams.get('ddd')
  const source = url.searchParams.get('source')
  const channel = url.searchParams.get('channel')
  const vaicrmStage = url.searchParams.get('vaicrmStage')
  const vaicrmSaleStatus = url.searchParams.get('vaicrmSaleStatus')
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  const where: any = {}
  if (status) where.status = status
  if (ddd) where.ddd = ddd
  if (source) where.source = source
  if (vaicrmStage) where.vaicrmStage = vaicrmStage
  if (vaicrmSaleStatus) where.vaicrmTags = { contains: `"${vaicrmSaleStatus}"` }
  if (channel === 'meta_sem_etiqueta') {
    where.AND = [untaggedMetaWhere()]
  } else if (channel === 'ssrj') {
    where.ssrj = true
  } else if (channel === 'viratecnico') {
    where.viraTecnico = true
  } else if (channel) {
    where.channel = channel
  }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom + 'T00:00:00-03:00')
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999-03:00')
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  // Segmentação mutuamente exclusiva: Derrubados sai de Novos/Outros.
  const derrubados = leads.filter((l) => l.isDropped)
  const novos = leads.filter((l) => l.isNewConversation && !l.isDropped && !l.isAluno)
  const outros = leads.filter((l) => !l.isDropped && (!l.isNewConversation || l.isAluno))

  const wb = XLSX.utils.book_new()

  // Aba 1: Novos Contatos
  const wsNovos = XLSX.utils.json_to_sheet(novos.map(mapRow))
  setColumnWidths(wsNovos)
  XLSX.utils.book_append_sheet(wb, wsNovos, 'Novos Contatos')

  // Aba 2: Outros Contatos
  const wsOutros = XLSX.utils.json_to_sheet(outros.map(mapRow))
  setColumnWidths(wsOutros)
  XLSX.utils.book_append_sheet(wb, wsOutros, 'Outros Contatos')

  // Aba 3: Derrubados
  const wsDerrubados = XLSX.utils.json_to_sheet(derrubados.map(mapRow))
  setColumnWidths(wsDerrubados)
  XLSX.utils.book_append_sheet(wb, wsDerrubados, 'Derrubados')

  // Aba 4: Performance por Anúncio
  try {
    const adFromStr = dateFrom || TRACKING_START_DATE
    const adToStr = dateTo || new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const adFrom = new Date(adFromStr + 'T00:00:00-03:00')
    const adTo = new Date(adToStr + 'T23:59:59.999-03:00')
    const { rows: adRows } = await getAdPerformance(adFrom, adTo, adFromStr, adToStr)
    const adSheetRows = adRows.map((a) => ({
      'Anúncio / Produto': a.adName,
      'Campanha': a.campaignName,
      'Leads': a.leads,
      'Qualificados': a.qualificados,
      'Taxa Qualif.': a.leads > 0 ? `${((a.qualificados / a.leads) * 100).toFixed(1)}%` : '—',
      'Gasto (R$)': a.spend > 0 ? Number(a.spend.toFixed(2)) : '',
      'Custo/Lead (R$)': a.costPerLead > 0 ? Number(a.costPerLead.toFixed(2)) : '',
      'Link do Anúncio': a.adUrl || '',
    }))
    const wsAds = XLSX.utils.json_to_sheet(
      adSheetRows.length > 0
        ? adSheetRows
        : [{ 'Anúncio / Produto': 'Nenhum lead de anúncio no período', 'Campanha': '', 'Leads': '', 'Qualificados': '', 'Taxa Qualif.': '', 'Gasto (R$)': '', 'Custo/Lead (R$)': '', 'Link do Anúncio': '' }]
    )
    wsAds['!cols'] = [
      { wch: 40 }, // Anúncio / Produto
      { wch: 30 }, // Campanha
      { wch: 8 },  // Leads
      { wch: 14 }, // Qualificados
      { wch: 12 }, // Taxa Qualif.
      { wch: 14 }, // Gasto
      { wch: 16 }, // Custo/Lead
      { wch: 50 }, // Link
    ]
    XLSX.utils.book_append_sheet(wb, wsAds, 'Performance por Anúncio')
  } catch (e: any) {
    console.error('[EXPORT] erro na aba de performance por anúncio:', e?.message)
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-')

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="leads_${today}.xlsx"`,
    },
  })
}

function setColumnWidths(ws: XLSX.WorkSheet) {
  ws['!cols'] = [
    { wch: 25 }, // Nome
    { wch: 20 }, // Telefone Completo
    { wch: 6 },  // DDI
    { wch: 6 },  // DDD
    { wch: 16 }, // Status
    { wch: 12 }, // Fonte
    { wch: 14 }, // Canal
    { wch: 16 }, // Etapa (VCRM)
    { wch: 26 }, // Situação de venda (VCRM)
    { wch: 12 }, // Valor (VCRM)
    { wch: 12 }, // Vira Técnico
    { wch: 30 }, // Anúncio
    { wch: 20 }, // Campanha
    { wch: 8 },  // Aluno
    { wch: 14 }, // Meta Enviado
    { wch: 18 }, // Abertura Atend.
    { wch: 18 }, // Assumido em
    { wch: 18 }, // Encerramento Atend.
    { wch: 20 }, // Espera
    { wch: 14 }, // Duração Atend.
    { wch: 18 }, // Recebido em
  ]
}
