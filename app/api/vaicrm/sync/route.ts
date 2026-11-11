export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { syncVaiVendas } from '@/lib/vaicrm-sync'

// POST /api/vaicrm/sync
// Puxa os contatos novos da Vai de Vendas e grava como leads (dedupe por
// telefone). Autorização: sessão de usuário OU cabeçalho x-sync-secret igual a
// VAICRM_SYNC_SECRET (usado pela tarefa agendada).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const secret = req.headers.get('x-sync-secret')
  const configured = process.env.VAICRM_SYNC_SECRET
  const authorized = !!session || (!!configured && secret === configured)
  if (!authorized) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const result = await syncVaiVendas()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[VAICRM_SYNC] erro:', e?.message ?? e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro na sincronização' }, { status: 500 })
  }
}
