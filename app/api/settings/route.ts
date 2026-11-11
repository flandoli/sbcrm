export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { clearViraTecnicoCache, clearSsrjChannelsCache, parseIdList, VIRA_TECNICO_CHANNELS_KEY, VIRA_TECNICO_TAGS_KEY, SSRJ_CHANNELS_KEY } from '@/lib/vira-tecnico-utils'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings ?? []) {
    map[s.key] = s.value
  }
  return NextResponse.json(map)
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { key, value } = body ?? {}

  if (!key) return NextResponse.json({ error: 'Key obrigatória' }, { status: 400 })

  await prisma.setting.upsert({
    where: { key },
    update: { value: String(value ?? '') },
    create: { key, value: String(value ?? '') },
  })

  // Invalida os caches de configuração ao salvar as chaves correspondentes.
  if (key === VIRA_TECNICO_CHANNELS_KEY || key === VIRA_TECNICO_TAGS_KEY) {
    clearViraTecnicoCache()
  }
  if (key === SSRJ_CHANNELS_KEY) {
    clearSsrjChannelsCache()
  }

  // Marcação retroativa: ao mapear canais (linhas de WhatsApp), marca os leads que
  // JÁ entraram por esses canais. Sem isso, o mapeamento só valeria para eventos futuros
  // e os cards continuariam zerados. Apenas seta true (sticky), nunca reverte.
  let backfilled = 0
  try {
    if (key === SSRJ_CHANNELS_KEY) {
      const channels = parseIdList(String(value ?? ''))
      if (channels.length) {
        const r = await prisma.lead.updateMany({
          where: { opaChannelId: { in: channels }, ssrj: false },
          data: { ssrj: true },
        })
        backfilled = r.count
      }
    }
    if (key === VIRA_TECNICO_CHANNELS_KEY) {
      const channels = parseIdList(String(value ?? ''))
      if (channels.length) {
        const r = await prisma.lead.updateMany({
          where: { opaChannelId: { in: channels }, viraTecnico: false },
          data: { viraTecnico: true },
        })
        backfilled = r.count
      }
    }
  } catch {}

  return NextResponse.json({ success: true, backfilled })
}
