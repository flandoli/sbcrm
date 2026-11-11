export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, hasRole } from '@/lib/session'
import { EDITABLE_SETTING_KEYS, SETTING_KEYS } from '@/lib/settings'
import { audit } from '@/lib/audit'

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const settings = await prisma.setting.findMany({ where: { key: { in: EDITABLE_SETTING_KEYS } } })
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return NextResponse.json(map)
}

function validate(key: string, value: string): string | null {
  if (key === SETTING_KEYS.allowedDdds) {
    try {
      const arr = JSON.parse(value)
      if (!Array.isArray(arr) || !arr.every((d) => /^\d{2}$/.test(String(d)))) return 'Lista de DDDs inválida'
    } catch {
      return 'Lista de DDDs deve ser JSON'
    }
  } else if (value !== 'true' && value !== 'false') {
    return 'Valor deve ser "true" ou "false"'
  }
  return null
}

// Somente Admin altera configurações; toda alteração grava AuditLog.
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!hasRole(user, 'ADMIN')) return NextResponse.json({ error: 'Apenas Admin' }, { status: 403 })

  const { key, value } = (await req.json().catch(() => ({}))) ?? {}
  if (!key || !EDITABLE_SETTING_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Chave de configuração inválida' }, { status: 400 })
  }
  const strValue = String(value ?? '')
  const err = validate(key, strValue)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const before = await prisma.setting.findUnique({ where: { key } })
  await prisma.setting.upsert({ where: { key }, update: { value: strValue }, create: { key, value: strValue } })
  await audit({
    userId: user.id,
    acao: 'setting.update',
    entidade: 'Setting',
    entidadeId: key,
    valorAnterior: before ? { value: before.value } : null,
    valorNovo: { value: strValue },
  })

  return NextResponse.json({ success: true })
}
