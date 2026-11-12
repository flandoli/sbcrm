export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jsonError, requireUser } from '@/lib/api'
import { importarArquivo } from '@/lib/import/importer'

const LIMITE = 20 * 1024 * 1024

// Upload do arquivo padrão de importação (.xlsx). simular=1 valida sem gravar. Auditoria feita pelo importador.
export async function POST(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user
  const form = await req.formData().catch(() => null)
  const file = form?.get('arquivo')
  if (!(file instanceof File)) return jsonError('Envie o arquivo .xlsx no campo "arquivo"')
  if (!/\.xlsx$/i.test(file.name)) return jsonError('Formato não suportado: use o modelo .xlsx')
  if (file.size > LIMITE) return jsonError('Arquivo maior que 20 MB')
  try {
    const r = await importarArquivo(prisma, Buffer.from(await file.arrayBuffer()), {
      userId: user.id,
      simular: form?.get('simular') === '1',
      arquivo: file.name,
    })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[IMPORT]', e)
    return jsonError(e instanceof Error ? e.message : 'Falha na importação', 422)
  }
}
