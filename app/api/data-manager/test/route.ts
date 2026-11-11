export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { testDataManagerConnection, isDataManagerConfigured } from '@/lib/google-data-manager'

/**
 * POST /api/data-manager/test
 * Testa a conexão com a Data Manager API.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!isDataManagerConfigured()) {
    return NextResponse.json({ success: false, message: 'Variáveis de ambiente não configuradas (GOOGLE_DM_REFRESH_TOKEN, GOOGLE_ADS_CLIENT_ID, etc.)' })
  }

  const result = await testDataManagerConnection()
  return NextResponse.json({
    success: result.ok,
    message: result.ok ? 'Conexão com Data Manager OK' : (result.error ?? 'Erro desconhecido'),
  })
}
