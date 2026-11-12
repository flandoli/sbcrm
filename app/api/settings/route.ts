export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { EDITABLE_SETTING_KEYS, SETTING_KEYS } from '@/lib/settings'
import { audit } from '@/lib/audit'
import { jsonError, readJson, requireUser } from '@/lib/api'
import { reclassifyLeads } from '@/lib/qualification'

// Chaves que mudam a classificação de leads já existentes → reclassificação retroativa ao salvar.
const RECLASSIFY_KEYS: string[] = [SETTING_KEYS.allowedDdds, SETTING_KEYS.allowedDdis, SETTING_KEYS.autoQualify]

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const settings = await prisma.setting.findMany({ where: { key: { in: EDITABLE_SETTING_KEYS } } })
  return NextResponse.json(Object.fromEntries(settings.map((s) => [s.key, s.value])))
}

function validateList(value: string, re: RegExp, label: string): string | null {
  try {
    const arr = JSON.parse(value)
    if (!Array.isArray(arr) || !arr.every((d) => re.test(String(d)))) return `Lista de ${label} inválida`
  } catch {
    return `Lista de ${label} deve ser JSON`
  }
  return null
}

async function validate(key: string, value: string): Promise<string | null> {
  switch (key) {
    case SETTING_KEYS.allowedDdds:
      return validateList(value, /^\d{2}$/, 'DDDs')
    case SETTING_KEYS.allowedDdis:
      return validateList(value, /^\d{1,3}$/, 'DDIs')
    case SETTING_KEYS.funnelPreset: {
      if (value !== 'v1' && value !== 'v2') return 'Preset deve ser "v1" ou "v2"'
      // Não troca de preset com cartões abertos em etapas do preset atual (evita cartões órfãos no Kanban).
      const abertas = await prisma.opportunity.count({ where: { resultado: null, stage: { preset: { not: value } } } })
      return abertas ? `Há ${abertas} oportunidade(s) aberta(s) no preset atual. Mova-as antes de trocar.` : null
    }
    default:
      return value === 'true' || value === 'false' ? null : 'Valor deve ser "true" ou "false"'
  }
}

// Somente Admin altera configurações; toda alteração grava AuditLog.
export async function PUT(req: Request) {
  const user = await requireUser('ADMIN')
  if (user instanceof NextResponse) return user

  const { key, value } = await readJson(req)
  if (!key || !EDITABLE_SETTING_KEYS.includes(key)) return jsonError('Chave de configuração inválida')
  const strValue = String(value ?? '')
  const err = await validate(key, strValue)
  if (err) return jsonError(err)

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

  let reclassificacao = null
  if (RECLASSIFY_KEYS.includes(key) && before?.value !== strValue) {
    reclassificacao = await reclassifyLeads()
    if (reclassificacao.alterados) {
      await audit({ userId: user.id, acao: 'lead.reclassify', entidade: 'Lead', valorNovo: { motivo: key, ...reclassificacao } })
    }
  }

  return NextResponse.json({ success: true, reclassificacao })
}
