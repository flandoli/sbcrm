export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { testMetaConnection } from '@/lib/meta-capi'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const setting = await prisma.setting.findUnique({ where: { key: 'meta_test_event_code' } })
  const result = await testMetaConnection(setting?.value)
  return NextResponse.json(result)
}
