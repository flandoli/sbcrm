// Importa o arquivo padrão (gerado por `yarn import:converter` ou preenchido à mão).
//
//   yarn import:base --arquivo Importacao_Base_Inicial.xlsx --usuario admin@empresa.com.br [--simular]
//
// --usuario: e-mail de um usuário ADMIN existente (fica registrado na auditoria e no histórico de etapas).
// --simular: valida e mostra o que seria feito, sem gravar nada.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { importarArquivo } from '../../lib/import/importer'

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const arquivo = arg('arquivo')
  const email = (arg('usuario') ?? process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase()
  if (!arquivo) throw new Error('Informe --arquivo <caminho do .xlsx>')
  if (!email) throw new Error('Informe --usuario <e-mail do Admin>')
  const admin = await prisma.user.findUnique({ where: { email } })
  if (!admin || admin.papel !== 'ADMIN' || !admin.ativo) throw new Error(`${email} não é um Admin ativo.`)

  const t0 = Date.now()
  const r = await importarArquivo(prisma, await readFile(arquivo), {
    userId: admin.id,
    simular: process.argv.includes('--simular'),
    arquivo: path.basename(arquivo),
  })
  const { avisos, ...resumo } = r
  console.log(JSON.stringify({ ...resumo, avisos: avisos.length, segundos: (Date.now() - t0) / 1000 }, null, 2))
  if (avisos.length) console.log(`\nAvisos:\n- ${avisos.join('\n- ')}`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
