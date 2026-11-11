export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { parsePhone } from '@/lib/phone-utils'
import { uploadOfflineConversions, isDataManagerConfigured } from '@/lib/google-data-manager'
import { sendMetaPurchases } from '@/lib/meta-purchase'
import {
  buildColumnMap,
  cell,
  parseValor,
  parseDataMatricula,
  phoneCellValue,
  isScientificNotation,
} from '@/lib/sales-utils'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (f && f instanceof File) file = f
  } catch {
    return NextResponse.json({ error: 'Falha ao ler o arquivo enviado.' }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
  }

  let rows: any[][] = []
  let rowsRaw: any[][] = []
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const name = (file.name || '').toLowerCase()
    const isCsv = name.endsWith('.csv') || (file.type || '').includes('csv')
    // CSV do Google Sheets vem em UTF-8: decodifica como texto para preservar
    // acentos (ex.: "VITÓRIA"). XLSX binário já é unicode internamente.
    const wb = isCsv
      ? XLSX.read(buf.toString('utf-8'), { type: 'string' })
      : XLSX.read(buf, { type: 'buffer' })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    // header:1 -> array de arrays; raw:false devolve o texto formatado (preserva
    // decimais brasileiros como "895,9" em vez de coagir para número US).
    rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false, blankrows: false })
    // Segunda leitura com raw:true para recuperar telefones armazenados como
    // número (evita a notação científica que perde dígitos). Alinha linha a
    // linha com `rows` (mesmas opções de blankrows/defval).
    rowsRaw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: true, blankrows: false })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Não foi possível ler a planilha. Envie um arquivo CSV ou XLSX válido.' },
      { status: 400 },
    )
  }

  if (!rows || rows.length < 2) {
    return NextResponse.json(
      { error: 'A planilha não contém dados (é necessário cabeçalho + ao menos uma linha).' },
      { status: 400 },
    )
  }

  const header = rows[0]
  const map = buildColumnMap(header)

  if (map.matricula < 0) {
    return NextResponse.json(
      {
        error:
          'Coluna "MATRICULA" não encontrada no cabeçalho. Verifique se a primeira linha contém os nomes das colunas.',
      },
      { status: 400 },
    )
  }

  // Proteção: a planilha de matrículas PRECISA ter uma coluna de data. Sem ela,
  // um upload errado zeraria a data de todas as vendas (corrompendo o ROI).
  // Melhor rejeitar o arquivo do que gravar datas nulas silenciosamente.
  if (map.dataMatricula < 0) {
    return NextResponse.json(
      {
        error:
          'Coluna de DATA da matrícula não encontrada no cabeçalho (ex.: "Data Matricula"). ' +
          'O arquivo enviado não parece ser a planilha de matrículas. Verifique se está enviando ' +
          'o arquivo correto neste card e se a primeira linha contém os nomes das colunas.',
      },
      { status: 400 },
    )
  }

  let total = 0
  let imported = 0
  let matched = 0
  let unmatched = 0
  let skipped = 0
  let phoneCorrupted = 0
  const errors: string[] = []
  const phoneIdx = map['phone']

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue
    total++

    const matricula = cell(row, map, 'matricula')
    if (!matricula) {
      skipped++
      continue
    }

    // Prioriza o valor bruto (raw) da coluna de telefone para preservar todos os
    // dígitos quando ele foi armazenado como número no arquivo.
    const rawPhoneVal = phoneIdx >= 0 && rowsRaw[i] ? rowsRaw[i][phoneIdx] : undefined
    let phoneRaw = phoneCellValue(rawPhoneVal, cell(row, map, 'phone'))
    if (isScientificNotation(phoneRaw)) phoneCorrupted++
    const parsed = phoneRaw ? parsePhone(phoneRaw) : null
    const phoneNormalized = parsed?.normalized ?? null

    // Cruza com lead existente pelo telefone normalizado
    let leadId: string | null = null
    if (phoneNormalized) {
      const lead = await prisma.lead.findUnique({
        where: { phoneNormalized },
        select: { id: true },
      })
      if (lead) leadId = lead.id
    }

    const data = {
      idEscola: cell(row, map, 'idEscola') || null,
      dataMatricula: parseDataMatricula(cell(row, map, 'dataMatricula')),
      nome: cell(row, map, 'nome') || null,
      email: cell(row, map, 'email') || null,
      phoneRaw: phoneRaw || '',
      phoneNormalized,
      ddi: parsed?.ddi ?? null,
      ddd: parsed?.ddd ?? null,
      uf: cell(row, map, 'uf') || null,
      curso: cell(row, map, 'curso') || null,
      valorPago: parseValor(cell(row, map, 'valorPago')),
      formaPgto: cell(row, map, 'formaPgto') || null,
      midia: cell(row, map, 'midia') || null,
      formaContato: cell(row, map, 'formaContato') || null,
      leadId,
      matched: Boolean(leadId),
    }

    // Em atualizações de vendas já existentes, nunca sobrescrever data/valor com
    // null: se a célula vier vazia/ilegível, preserva o valor atual em vez de
    // apagá-lo (evita corromper registros já corretos num upload parcial).
    const updateData: typeof data = { ...data }
    if (updateData.dataMatricula === null) delete (updateData as any).dataMatricula
    if (updateData.valorPago === null) delete (updateData as any).valorPago

    try {
      await prisma.sale.upsert({
        where: { matricula },
        create: { matricula, ...data },
        update: updateData,
      })
      imported++
      if (leadId) matched++
      else unmatched++
    } catch (e: any) {
      errors.push(`Matrícula ${matricula}: ${e?.message ?? 'erro ao salvar'}`)
    }
  }

  const warnings: string[] = []
  if (phoneCorrupted > 0) {
    warnings.push(
      `${phoneCorrupted} telefone(s) vieram corrompidos em notação científica (ex.: "5.51195E+12") ` +
        `e não puderam ser cruzados com leads. Isso ocorre quando a coluna de telefone da planilha ` +
        `está formatada como NÚMERO. Reexporte com a coluna de telefone formatada como TEXTO e ` +
        `reenvie o arquivo para corrigir o cruzamento.`,
    )
  }

  // Upload automático de conversões offline ao Google (se configurado)
  let offlineConvResult: any = null
  if (isDataManagerConfigured() && matched > 0) {
    try {
      offlineConvResult = await uploadOfflineConversions()
      console.log(`[UPLOAD] Conversões offline: ${offlineConvResult.sent} enviadas, ${offlineConvResult.errors} erros`)
    } catch (e: any) {
      console.error('[UPLOAD] Erro no upload de conversões offline:', e?.message)
      offlineConvResult = { error: e?.message }
    }
  }

  // Dispara eventos Purchase à Meta (Conversions API) para as vendas que casaram
  // com leads de origem Meta e ainda não foram enviadas.
  let metaPurchaseResult: any = null
  if (matched > 0) {
    try {
      metaPurchaseResult = await sendMetaPurchases()
      console.log(`[UPLOAD] Purchase à Meta: ${metaPurchaseResult.sent} enviadas, ${metaPurchaseResult.errors} erros`)
    } catch (e: any) {
      console.error('[UPLOAD] Erro no envio de Purchase à Meta:', e?.message)
      metaPurchaseResult = { error: e?.message }
    }
  }

  return NextResponse.json({
    ok: true,
    total,
    imported,
    matched,
    unmatched,
    skipped,
    phoneCorrupted,
    warnings,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
    offlineConversions: offlineConvResult,
    metaPurchases: metaPurchaseResult,
  })
}
