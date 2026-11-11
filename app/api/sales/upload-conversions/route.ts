export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { uploadOfflineConversions, isDataManagerConfigured } from '@/lib/google-data-manager'

/**
 * POST /api/sales/upload-conversions
 * Envia conversões offline ao Google (Data Manager API).
 * Body opcional: { saleIds?: string[] } — se vazio, busca todas as elegíveis.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!isDataManagerConfigured()) {
    return NextResponse.json(
      { error: 'Data Manager API não configurada. Verifique as variáveis de ambiente.' },
      { status: 400 }
    )
  }

  try {
    let saleIds: string[] | undefined
    try {
      const body = await req.json()
      if (body?.saleIds && Array.isArray(body.saleIds)) {
        saleIds = body.saleIds
      }
    } catch {
      // body vazio — busca todas
    }

    const result = await uploadOfflineConversions(saleIds)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[UPLOAD_CONV] Erro:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Erro ao enviar conversões' }, { status: 500 })
  }
}
