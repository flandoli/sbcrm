// Seed: cria (ou atualiza) o usuário Admin e os dados iniciais de configuração (idempotente).
// Credenciais vêm SOMENTE de variáveis de ambiente — nada hardcoded.
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (mín. 12 caracteres), SEED_ADMIN_NAME (opcional)
// Também cria os Settings iniciais (allowed_ddds vazio = padrão, auto_qualify=true, capi_enabled=false)
// apenas se ainda não existirem, e registra tudo em AuditLog. Não apaga nada.
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { PRESETS, UFS } from '../lib/funnel-presets'
import { buildDefaultTransitions, ensurePresetStages, replaceTransitions } from '../lib/admin/funnel'

const prisma = new PrismaClient()

const DEFAULT_SETTINGS: Record<string, string> = {
  allowed_ddds: '[]',
  auto_qualify: 'true',
  capi_enabled: 'false',
  allowed_ddis: '[]',
  funnel_preset: 'v1',
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador'

  if (!email || !password) {
    throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para rodar o seed.')
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.')
  }

  const hash = await bcrypt.hash(password, 12)
  const admin = await prisma.user.upsert({
    where: { email },
    update: { password: hash, papel: 'ADMIN', ativo: true, name },
    create: { email, password: hash, papel: 'ADMIN', name },
  })

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await prisma.setting.findUnique({ where: { key } })
    if (existing) continue
    await prisma.setting.create({ data: { key, value } })
    await prisma.auditLog.create({
      data: { userId: admin.id, acao: 'setting.create', entidade: 'Setting', entidadeId: key, valorNovo: { value } },
    })
  }

  // Marco 1: etapas e transições padrão dos presets v1/v2 (só se o preset ainda não tiver etapas).
  for (const preset of PRESETS) {
    const criadas = await ensurePresetStages(prisma, preset)
    if (!criadas) continue
    const transitions = await buildDefaultTransitions(prisma, preset)
    await replaceTransitions(prisma, preset, transitions)
    await prisma.auditLog.create({
      data: { userId: admin.id, acao: 'seed.funnel', entidade: 'Stage', entidadeId: preset, valorNovo: { etapas: criadas, transicoes: transitions.length } },
    })
    console.log(`Preset ${preset}: ${criadas} etapas, ${transitions.length} transições`)
  }

  // UFs no catálogo (só as que faltam).
  const ufsExistentes = new Set((await prisma.catalogItem.findMany({ where: { tipo: 'UF' }, select: { codigo: true } })).map((u) => u.codigo))
  const novasUfs = UFS.filter(([sigla]) => !ufsExistentes.has(sigla))
  if (novasUfs.length) {
    await prisma.catalogItem.createMany({
      data: novasUfs.map(([codigo, nome], i) => ({ tipo: 'UF' as const, codigo, nome, ordem: i + 1 })),
      skipDuplicates: true,
    })
    await prisma.auditLog.create({
      data: { userId: admin.id, acao: 'seed.catalog', entidade: 'CatalogItem', entidadeId: 'UF', valorNovo: { criadas: novasUfs.length } },
    })
  }

  await prisma.auditLog.create({
    data: { userId: admin.id, acao: 'seed.admin', entidade: 'User', entidadeId: admin.id, valorNovo: { email, papel: 'ADMIN' } },
  })

  console.log(`Admin pronto: ${email}`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
