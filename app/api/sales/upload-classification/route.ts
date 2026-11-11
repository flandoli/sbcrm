export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { deriveGrupoMacro, normalizeClass } from '@/lib/midia-grupo-map'
import * as XLSX from 'xlsx'

/**
 * POST /api/sales/upload-classification
 *
 * Recebe planilha XLSX com colunas:
 *   - Matricula (nº da matrícula — chave de join com Sale.matricula)
 *   - MIDIA AJUSTADA (classificação refinada)
 *   - GRUPO MACRO (grupo macro de atribuição)
 *
 * Atualiza midiaAjustada e grupoMacro em todas as vendas existentes que
 * têm matrícula correspondente na planilha.
 */
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

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false,
    })

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Planilha vazia ou sem dados.' }, { status: 400 })
    }

    // Find columns by header (case-insensitive, trimmed)
    const headers = rows[0].map((h: any) => String(h).trim().toUpperCase())
    const colMatricula = headers.findIndex((h: string) => h === 'MATRICULA' || h === 'MATRÍCULA')
    const colMidiaAjustada = headers.findIndex((h: string) => h === 'MIDIA AJUSTADA' || h === 'MÍDIA AJUSTADA')
    const colGrupoMacro = headers.findIndex((h: string) => h === 'GRUPO MACRO')

    if (colMatricula === -1) {
      return NextResponse.json(
        { error: 'Coluna "Matricula" não encontrada na planilha. Verifique os cabeçalhos.' },
        { status: 400 },
      )
    }
    // Proteção: exige a coluna "GRUPO MACRO". Isso impede que a planilha de
    // MATRÍCULAS (que não tem essa coluna) seja enviada por engano neste card e
    // acabe gravando classificações inválidas.
    if (colGrupoMacro === -1) {
      return NextResponse.json(
        {
          error:
            'Coluna "GRUPO MACRO" não encontrada. Este card é para a planilha de CLASSIFICAÇÃO DE MÍDIA ' +
            '(com as colunas "GRUPO MACRO" e "MIDIA AJUSTADA"). Se você quer importar matrículas, use o card ' +
            '"Importar planilha de matrículas".',
        },
        { status: 400 },
      )
    }

    // Build map: matricula -> { midiaAjustada, grupoMacro }
    const classMap = new Map<string, { midiaAjustada: string | null; grupoMacro: string | null }>()
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const mat = String(row[colMatricula] ?? '').trim()
      if (!mat) continue
      const mAjust = colMidiaAjustada !== -1 ? String(row[colMidiaAjustada] ?? '').trim() || null : null
      const gMacro = colGrupoMacro !== -1 ? String(row[colGrupoMacro] ?? '').trim() || null : null
      classMap.set(mat, { midiaAjustada: mAjust, grupoMacro: gMacro })
    }

    if (classMap.size === 0) {
      return NextResponse.json({ error: 'Nenhuma matrícula encontrada na planilha.' }, { status: 400 })
    }

    // Blindagem de consistência: o GRUPO MACRO informado deve bater com o grupo
    // derivado da MIDIA AJUSTADA (relação determinística). Uma planilha com a
    // coluna GRUPO MACRO desalinhada/deslocada corromperia a classificação da
    // base inteira — então rejeitamos antes de gravar qualquer coisa.
    if (colMidiaAjustada !== -1) {
      let checked = 0
      const divergences: {
        matricula: string
        midia: string
        grupoInformado: string
        grupoEsperado: string
      }[] = []
      for (const [mat, cls] of Array.from(classMap.entries())) {
        const expected = deriveGrupoMacro(cls.midiaAjustada)
        if (!expected || !cls.grupoMacro) continue
        checked++
        if (normalizeClass(cls.grupoMacro) !== expected) {
          divergences.push({
            matricula: mat,
            midia: cls.midiaAjustada ?? '',
            grupoInformado: cls.grupoMacro,
            grupoEsperado: expected,
          })
        }
      }
      if (divergences.length > 0) {
        const examples = divergences
          .slice(0, 5)
          .map(
            d =>
              `• Matrícula ${d.matricula}: MIDIA AJUSTADA "${d.midia}" deveria ter GRUPO MACRO "${d.grupoEsperado}", mas a planilha traz "${d.grupoInformado}"`,
          )
          .join('\n')
        return NextResponse.json(
          {
            error:
              `Planilha rejeitada: a coluna "GRUPO MACRO" está inconsistente com a "MIDIA AJUSTADA" em ` +
              `${divergences.length} de ${checked} linhas verificadas. Isso normalmente indica que a coluna ` +
              `GRUPO MACRO está desalinhada/deslocada na planilha. Nenhuma venda foi alterada — corrija a ` +
              `planilha e reenvie.\n\nExemplos:\n${examples}`,
            divergencias: divergences.length,
            verificadas: checked,
          },
          { status: 400 },
        )
      }
    }

    // Fetch all Sales that match the matriculas in the spreadsheet
    const matriculas = Array.from(classMap.keys())
    // Process in chunks of 500 to avoid query size limits
    const CHUNK = 500
    let updated = 0
    let notFound = 0

    for (let i = 0; i < matriculas.length; i += CHUNK) {
      const chunk = matriculas.slice(i, i + CHUNK)
      const existingSales = await prisma.sale.findMany({
        where: { matricula: { in: chunk } },
        select: { id: true, matricula: true },
      })

      const existingMap = new Map(existingSales.map(s => [s.matricula, s.id]))
      const notInDb = chunk.filter(m => !existingMap.has(m))
      notFound += notInDb.length

      // Update in parallel (limited concurrency)
      const updatePromises = existingSales.map(sale => {
        const cls = classMap.get(sale.matricula)
        if (!cls) return Promise.resolve()
        return prisma.sale.update({
          where: { id: sale.id },
          data: {
            ...(cls.midiaAjustada !== null ? { midiaAjustada: cls.midiaAjustada } : {}),
            ...(cls.grupoMacro !== null ? { grupoMacro: cls.grupoMacro } : {}),
          },
        })
      })

      // Run 20 at a time
      for (let j = 0; j < updatePromises.length; j += 20) {
        await Promise.all(updatePromises.slice(j, j + 20))
        updated += Math.min(20, updatePromises.length - j)
      }
    }

    return NextResponse.json({
      success: true,
      totalPlanilha: classMap.size,
      atualizadas: updated,
      naoEncontradas: notFound,
      message: `Classificação aplicada: ${updated} vendas atualizadas, ${notFound} matrículas da planilha não encontradas no banco.`,
    })
  } catch (e: any) {
    console.error('[upload-classification] error:', e)
    return NextResponse.json(
      { error: `Erro ao processar planilha: ${e.message}` },
      { status: 500 },
    )
  }
}
