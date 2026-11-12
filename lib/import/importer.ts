// Importador do arquivo padrão (lib/import/layout.ts). Idempotente: casa cada registro pela coluna "Chave" (importKey).
// Usado pelo script `yarn import:base` e reaproveitável por uma rota de upload no Admin.
//
// Regras de atualização (reimportar o mesmo arquivo nunca duplica nem desfaz trabalho feito no sistema):
// • Conta existente: atualiza nome, segmento, situação e origem; o CNPJ só muda se o arquivo trouxer um CNPJ REAL
//   e a conta ainda estiver com CNPJ provisório. Um CNPJ real já cadastrado nunca é trocado por fantasma.
// • Conta nova sem CNPJ (ou com CNPJ inválido): recebe o próximo CNPJ fantasma livre (9999NNNN/0000-00) e fica marcada
//   como "CNPJ provisório" até alguém informar o real.
// • Oportunidade existente: etapa e responsável NÃO são alterados (podem ter sido movidos no funil); só a previsão vazia é preenchida.
// • Credenciais em texto ("senha: ...") nunca são gravadas.
import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Prisma, PrismaClient, Segmento, TipoOrigem } from '@prisma/client'
import { ABAS, COLS, PAPEL_PESSOA_IN, SEGMENTO_IN, SITUACAO_IN, TIPO_OPOR_IN, TIPO_PRODUTO_IN } from './layout'
import {
  CNPJ_FANTASMA_PREFIXO,
  cnpjFantasma,
  contemCredencial,
  isCnpjFantasma,
  isCnpjValido,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  onlyDigits,
  splitCnpj,
} from './normalize'

type Tx = Prisma.TransactionClient
type Linha = Record<string, string>

export interface ImportOptions {
  userId: string // quem está importando (auditoria e histórico de etapa)
  simular?: boolean // valida e calcula tudo, mas desfaz no final
  arquivo?: string // nome do arquivo (auditoria)
}

export interface ImportResult {
  simulado: boolean
  contas: { criadas: number; atualizadas: number; cnpjProvisorio: number }
  contatos: { criados: number; atualizados: number }
  oportunidades: { criadas: number; atualizadas: number }
  notas: { criadas: number; atualizadas: number }
  produtos: { criados: number; atualizados: number }
  categorias: { criadas: number; atualizadas: number }
  usuariosCriados: string[]
  origensCriadas: string[]
  avisos: string[]
}

class Simulacao extends Error {
  constructor(public resultado: ImportResult) {
    super('simulação')
  }
}

const ORIGEM_TIPO: [RegExp, TipoOrigem][] = [
  [/prospec/, 'PROSPECCAO'],
  [/parceir/, 'PARCEIRO'],
  [/indica/, 'INDICACAO'],
  [/midia|anuncio|google|meta|site/, 'MIDIA'],
  [/evento|feira|congresso|connection/, 'EVENTO'],
]

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if ('text' in v) return String((v as { text: unknown }).text)
    if ('result' in v) return cellText((v as { result: ExcelJS.CellValue }).result)
    return ''
  }
  return String(v)
}

function lerAba(wb: ExcelJS.Workbook, nome: string, colunas: readonly string[], obrigatoria: boolean): Linha[] {
  const ws = wb.getWorksheet(nome)
  if (!ws) {
    if (obrigatoria) throw new Error(`Aba "${nome}" não encontrada no arquivo.`)
    return []
  }
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).map((v) => cellText(v).trim())
  const idx = new Map(colunas.map((c) => [c, header.indexOf(c)]))
  const faltando = colunas.filter((c) => (idx.get(c) ?? -1) < 1 && c !== 'Pendências')
  if (faltando.length) throw new Error(`Aba "${nome}": colunas ausentes: ${faltando.join(', ')}`)
  const linhas: Linha[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const l: Linha = { _linha: String(n) }
    for (const [c, i] of idx) l[c] = i > 0 ? cellText(row.getCell(i).value).trim() : ''
    if (colunas.some((c) => l[c])) linhas.push(l)
  })
  return linhas
}

function parseData(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12))
  return Number.isNaN(d.getTime()) ? null : d
}

const sim = (s: string) => /^(sim|s|true|1|x)$/i.test(s.trim())

export async function importarArquivo(prisma: PrismaClient, buffer: Buffer | ArrayBuffer, opts: ImportOptions): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as ArrayBuffer)
  const dados = {
    empresas: lerAba(wb, ABAS.empresas, COLS.empresas, true),
    contatos: lerAba(wb, ABAS.contatos, COLS.contatos, false),
    oportunidades: lerAba(wb, ABAS.oportunidades, COLS.oportunidades, false),
    notas: lerAba(wb, ABAS.notas, COLS.notas, false),
    produtos: lerAba(wb, ABAS.produtos, COLS.produtos, false),
    categorias: lerAba(wb, ABAS.categorias, COLS.categorias, false),
  }
  const sha = crypto.createHash('sha256').update(Buffer.from(buffer as ArrayBuffer)).digest('hex').slice(0, 16)

  try {
    return await prisma.$transaction((tx) => executar(tx, dados, opts, sha), { timeout: 600_000, maxWait: 30_000 })
  } catch (e) {
    if (e instanceof Simulacao) return e.resultado
    throw e
  }
}

async function executar(tx: Tx, d: Record<string, Linha[]>, opts: ImportOptions, sha: string): Promise<ImportResult> {
  const r: ImportResult = {
    simulado: !!opts.simular,
    contas: { criadas: 0, atualizadas: 0, cnpjProvisorio: 0 },
    contatos: { criados: 0, atualizados: 0 },
    oportunidades: { criadas: 0, atualizadas: 0 },
    notas: { criadas: 0, atualizadas: 0 },
    produtos: { criados: 0, atualizados: 0 },
    categorias: { criadas: 0, atualizadas: 0 },
    usuariosCriados: [],
    origensCriadas: [],
    avisos: [],
  }
  const aviso = (aba: string, l: Linha, msg: string) => r.avisos.push(`${aba} linha ${l._linha}: ${msg}`)
  const auditar = (acao: string, entidade: string, entidadeId: string | null, valorNovo: Prisma.InputJsonValue) =>
    tx.auditLog.create({ data: { userId: opts.userId, acao, entidade, entidadeId, valorNovo } })

  // ---------- usuários (vendedores) ----------
  const usuarios = new Map<string, string>()
  async function usuarioPorEmail(emailRaw: string, aba: string, l: Linha): Promise<string> {
    const email = emailRaw.trim().toLowerCase()
    if (!email) return opts.userId
    if (usuarios.has(email)) return usuarios.get(email)!
    let u = await tx.user.findUnique({ where: { email }, select: { id: true } })
    if (!u) {
      // Criado INATIVO com senha aleatória: o Admin ativa e define a senha em Admin → Usuários.
      const nome = email.split('@')[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      const senha = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 12)
      u = await tx.user.create({ data: { email, name: nome, papel: 'VENDEDOR', ativo: false, password: senha }, select: { id: true } })
      r.usuariosCriados.push(email)
      await auditar('import.user.create', 'User', u.id, { email, papel: 'VENDEDOR', ativo: false })
      aviso(aba, l, `vendedor ${email} não existia: criado inativo (ativar e definir senha em Admin → Usuários)`)
    }
    usuarios.set(email, u.id)
    return u.id
  }

  // ---------- origens ----------
  const origens = new Map<string, string>()
  async function origemPorNome(nome: string): Promise<string | null> {
    if (!nome) return null
    const k = normalizeName(nome)
    if (origens.has(k)) return origens.get(k)!
    const todas = await tx.leadOrigin.findMany({ select: { id: true, nome: true } })
    let o = todas.find((x) => normalizeName(x.nome) === k)
    if (!o) {
      const tipo = ORIGEM_TIPO.find(([re]) => re.test(k))?.[1] ?? 'OUTRO'
      o = await tx.leadOrigin.create({ data: { nome, tipo }, select: { id: true, nome: true } })
      r.origensCriadas.push(nome)
      await auditar('import.origin.create', 'LeadOrigin', o.id, { nome, tipo })
    }
    origens.set(k, o.id)
    return o.id
  }

  // ---------- CNPJ fantasma: próxima sequência livre ----------
  const fantasmasUsados = new Set(
    (
      await tx.account.findMany({
        where: { cnpjRaiz: { startsWith: CNPJ_FANTASMA_PREFIXO }, cnpjEstabelecimento: '0000' },
        select: { cnpjRaiz: true },
      })
    ).map((a) => Number(a.cnpjRaiz.slice(4))),
  )
  let proxSeq = 1
  const reservarFantasma = (preferido?: number) => {
    if (preferido && !fantasmasUsados.has(preferido)) {
      fantasmasUsados.add(preferido)
      return cnpjFantasma(preferido)
    }
    while (fantasmasUsados.has(proxSeq)) proxSeq++
    fantasmasUsados.add(proxSeq)
    return cnpjFantasma(proxSeq)
  }

  // ---------- empresas ----------
  const contas = new Map<string, string>() // chave → accountId
  for (const l of d.empresas) {
    const chave = l['Chave']
    const razao = l['Razão social']
    if (!chave || !razao) {
      aviso('Empresas', l, 'sem Chave ou Razão social: ignorada')
      continue
    }
    const segmento: Segmento | undefined = SEGMENTO_IN[l['Segmento'].toLowerCase()]
    if (!segmento) {
      aviso('Empresas', l, `segmento "${l['Segmento']}" inválido (use Varejo ou Indústria): ignorada`)
      continue
    }
    const statusConta = SITUACAO_IN[l['Situação'].toLowerCase()] ?? 'PROSPECT'
    const responsavelId = await usuarioPorEmail(l['Vendedor (e-mail)'], 'Empresas', l)
    const origemId = await origemPorNome(l['Origem'])
    const digitos = onlyDigits(l['CNPJ'])
    const real = isCnpjValido(digitos) ? digitos : null
    if (digitos && !real && !isCnpjFantasma(digitos)) aviso('Empresas', l, `CNPJ ${l['CNPJ']} inválido: conta recebe CNPJ provisório`)

    let existente = await tx.account.findUnique({ where: { importKey: chave } })
    if (!existente && real) {
      // Casamento por CNPJ exato (spec): a conta já cadastrada passa a ter esta chave.
      const s = splitCnpj(real)
      existente = await tx.account.findUnique({ where: { cnpjRaiz_cnpjEstabelecimento: { cnpjRaiz: s.cnpjRaiz, cnpjEstabelecimento: s.cnpjEstabelecimento } } })
      if (existente?.importKey && existente.importKey !== chave) {
        aviso('Empresas', l, `CNPJ ${l['CNPJ']} já pertence a outra conta importada (${existente.importKey}): ignorada`)
        continue
      }
    }

    const base = { razaoSocial: razao, nomeFantasia: l['Nome fantasia'] || null, segmento, statusConta, origemId }
    if (existente) {
      const data: Prisma.AccountUncheckedUpdateInput = { ...base, importKey: chave }
      if (real && existente.cnpjProvisorio) {
        const s = splitCnpj(real)
        const dono = await tx.account.findUnique({ where: { cnpjRaiz_cnpjEstabelecimento: { cnpjRaiz: s.cnpjRaiz, cnpjEstabelecimento: s.cnpjEstabelecimento } } })
        if (dono && dono.id !== existente.id) aviso('Empresas', l, `CNPJ ${l['CNPJ']} já usado por "${dono.razaoSocial}": mantido o provisório`)
        else Object.assign(data, s, { cnpjProvisorio: false })
      }
      await tx.account.update({ where: { id: existente.id }, data })
      contas.set(chave, existente.id)
      r.contas.atualizadas++
      if (existente.cnpjProvisorio && data.cnpjProvisorio !== false) r.contas.cnpjProvisorio++
      continue
    }

    let cnpj = real
    if (cnpj) {
      const s = splitCnpj(cnpj)
      const dono = await tx.account.findUnique({ where: { cnpjRaiz_cnpjEstabelecimento: { cnpjRaiz: s.cnpjRaiz, cnpjEstabelecimento: s.cnpjEstabelecimento } } })
      if (dono) cnpj = null
    }
    const provisorio = !cnpj
    if (provisorio) cnpj = reservarFantasma(isCnpjFantasma(digitos) ? Number(digitos.slice(4, 8)) : undefined)
    const criada = await tx.account.create({
      data: { ...base, ...splitCnpj(cnpj!), cnpjProvisorio: provisorio, responsavelId, importKey: chave },
    })
    contas.set(chave, criada.id)
    r.contas.criadas++
    if (provisorio) r.contas.cnpjProvisorio++
  }

  // Contas referenciadas por chave mas que não estão no arquivo (reimportação parcial).
  async function contaPorChave(chave: string): Promise<string | null> {
    if (!chave) return null
    if (contas.has(chave)) return contas.get(chave)!
    const a = await tx.account.findUnique({ where: { importKey: chave }, select: { id: true } })
    if (a) contas.set(chave, a.id)
    return a?.id ?? null
  }

  // ---------- contatos ----------
  for (const l of d.contatos) {
    const chave = l['Chave']
    const accountId = await contaPorChave(l['Chave empresa'])
    if (!chave || !l['Nome'] || !accountId) {
      aviso('Contatos', l, 'sem Chave, Nome ou empresa conhecida: ignorado')
      continue
    }
    const tel = l['Telefone'] ? normalizePhone(l['Telefone']) : null
    const em = l['E-mail'] ? normalizeEmail(l['E-mail']) : null
    if (em && !em.email) aviso('Contatos', l, `e-mail inválido descartado (${l['E-mail']})`)
    const papel = PAPEL_PESSOA_IN[l['Papel'].toLowerCase()] ?? 'INFLUENCIADOR'
    const data = { nome: l['Nome'], telefone: tel?.digits ?? '', email: em?.email ?? null, cargo: l['Cargo'] || null, area: l['Área'] || null }
    const existente = await tx.person.findUnique({ where: { importKey: chave } })
    let personId: string
    if (existente) {
      // Não apaga dado preenchido no sistema com célula vazia do arquivo.
      await tx.person.update({
        where: { id: existente.id },
        data: {
          nome: data.nome,
          telefone: data.telefone || existente.telefone,
          email: data.email ?? existente.email,
          cargo: data.cargo ?? existente.cargo,
          area: data.area ?? existente.area,
        },
      })
      personId = existente.id
      r.contatos.atualizados++
    } else {
      personId = (await tx.person.create({ data: { ...data, importKey: chave } })).id
      r.contatos.criados++
    }
    const vinculo = await tx.personRole.findFirst({ where: { personId, accountId } })
    if (!vinculo) {
      await tx.personRole.create({ data: { personId, accountId, papel, area: data.area } })
    } else if (l['Papel'] && PAPEL_PESSOA_IN[l['Papel'].toLowerCase()]) {
      await tx.personRole.update({ where: { id: vinculo.id }, data: { papel } })
    }
  }

  // ---------- oportunidades ----------
  const presetSetting = await tx.setting.findUnique({ where: { key: 'funnel_preset' } })
  const preset = presetSetting?.value === 'v2' ? 'v2' : 'v1'
  const etapas = await tx.stage.findMany({ where: { preset, ativo: true }, orderBy: { ordem: 'asc' } })
  if (d.oportunidades.length && !etapas.length) throw new Error(`O funil "${preset}" não tem etapas ativas. Rode o seed antes de importar.`)
  const etapaPorNome = new Map(etapas.map((e) => [normalizeName(e.nome), e]))
  const oportunidades = new Map<string, string>()

  for (const l of d.oportunidades) {
    const chave = l['Chave']
    const accountId = await contaPorChave(l['Chave empresa'])
    if (!chave || !accountId) {
      aviso('Oportunidades', l, 'sem Chave ou empresa conhecida: ignorada')
      continue
    }
    const previsao = l['Previsão de fechamento'] ? parseData(l['Previsão de fechamento']) : null
    if (l['Previsão de fechamento'] && !previsao) aviso('Oportunidades', l, `previsão "${l['Previsão de fechamento']}" inválida (use DD/MM/AAAA)`)
    const existente = await tx.opportunity.findUnique({ where: { importKey: chave } })
    if (existente) {
      if (!existente.previsaoFechamento && previsao) await tx.opportunity.update({ where: { id: existente.id }, data: { previsaoFechamento: previsao } })
      oportunidades.set(chave, existente.id)
      r.oportunidades.atualizadas++
      continue
    }
    const etapa = etapaPorNome.get(normalizeName(l['Etapa'])) ?? (preset === 'v2' ? etapaPorNome.get('leadprospeccao') : etapaPorNome.get('prospeccao')) ?? etapas[0]
    if (normalizeName(etapa.nome) !== normalizeName(l['Etapa'])) aviso('Oportunidades', l, `etapa "${l['Etapa']}" não existe no funil ${preset}: entrou em ${etapa.nome}`)
    const responsavelId = await usuarioPorEmail(l['Vendedor (e-mail)'], 'Oportunidades', l)
    const criada = await tx.opportunity.create({
      data: {
        accountId,
        stageId: etapa.id,
        responsavelId,
        tipo: TIPO_OPOR_IN[l['Tipo'].toLowerCase()] ?? 'NOVA_VENDA',
        previsaoFechamento: previsao,
        resultado: etapa.resultado ?? null,
        motivoPerda: etapa.resultado === 'PERDIDO' ? 'Importado da planilha: motivo não informado' : null,
        importKey: chave,
      },
    })
    await tx.stageHistory.create({ data: { opportunityId: criada.id, fromStageId: null, toStageId: etapa.id, userId: opts.userId } })
    oportunidades.set(chave, criada.id)
    r.oportunidades.criadas++
  }

  // ---------- notas ----------
  for (const l of d.notas) {
    const chave = l['Chave']
    const accountId = await contaPorChave(l['Chave empresa'])
    if (!chave || !l['Texto'] || !accountId) {
      aviso('Notas', l, 'sem Chave, Texto ou empresa conhecida: ignorada')
      continue
    }
    if (contemCredencial(l['Texto'])) {
      aviso('Notas', l, 'texto com credencial: NÃO importado')
      continue
    }
    let opportunityId: string | null = null
    if (l['Chave oportunidade']) {
      opportunityId = oportunidades.get(l['Chave oportunidade']) ?? (await tx.opportunity.findUnique({ where: { importKey: l['Chave oportunidade'] }, select: { id: true } }))?.id ?? null
    }
    const existente = await tx.note.findUnique({ where: { importKey: chave }, select: { id: true } })
    if (existente) {
      await tx.note.update({ where: { id: existente.id }, data: { texto: l['Texto'], opportunityId } })
      r.notas.atualizadas++
    } else {
      await tx.note.create({ data: { accountId, opportunityId, userId: opts.userId, texto: l['Texto'], origem: 'import:planilha', importKey: chave } })
      r.notas.criadas++
    }
  }

  // ---------- produtos (sem preço) ----------
  for (const l of d.produtos) {
    const codigo = l['Código'].toUpperCase()
    if (!codigo || !l['Nome']) {
      aviso('Produtos', l, 'sem Código ou Nome: ignorado')
      continue
    }
    const data = {
      nome: l['Nome'],
      tipo: TIPO_PRODUTO_IN[l['Tipo'].toLowerCase()] ?? 'SERVICO',
      segmento: SEGMENTO_IN[l['Segmento'].toLowerCase()] ?? null,
      tipoMidia: l['Tipo de mídia'] || null,
      descricao: l['Descrição'] || null,
      ativo: l['Ativo'] ? sim(l['Ativo']) : true,
    }
    const existe = await tx.product.findUnique({ where: { codigo }, select: { id: true } })
    await tx.product.upsert({ where: { codigo }, update: data, create: { codigo, ...data } })
    if (existe) r.produtos.atualizados++
    else r.produtos.criados++
  }

  // ---------- categorias (árvore de até 4 níveis, em lote) ----------
  if (d.categorias.length) {
    const NIVEIS = ['Departamento', 'Categoria', 'Subcategoria', 'Item']
    const nos = new Map<string, { caminho: string; nome: string; nivel: number; pai: string | null; faixa: string | null }>()
    for (const l of d.categorias) {
      const partes = NIVEIS.map((n) => l[n]).filter(Boolean)
      partes.forEach((nome, i) => {
        const caminho = partes.slice(0, i + 1).join(' > ')
        const atual = nos.get(caminho)
        const faixa = i === partes.length - 1 ? l['Faixa'] || null : null
        if (!atual) nos.set(caminho, { caminho, nome, nivel: i + 1, pai: i ? partes.slice(0, i).join(' > ') : null, faixa })
        else if (faixa) atual.faixa = faixa
      })
    }
    const existentes = new Map(
      (await tx.productCategory.findMany({ select: { id: true, caminho: true, faixa: true } })).map((c) => [c.caminho, c]),
    )
    for (let nivel = 1; nivel <= 4; nivel++) {
      const doNivel = [...nos.values()].filter((n) => n.nivel === nivel)
      const novos = doNivel.filter((n) => !existentes.has(n.caminho))
      if (novos.length) {
        await tx.productCategory.createMany({
          data: novos.map((n) => ({ caminho: n.caminho, nome: n.nome, nivel, faixa: n.faixa, parentId: n.pai ? existentes.get(n.pai)?.id ?? null : null })),
          skipDuplicates: true,
        })
        r.categorias.criadas += novos.length
        const criadas = await tx.productCategory.findMany({ where: { caminho: { in: novos.map((n) => n.caminho) } }, select: { id: true, caminho: true, faixa: true } })
        criadas.forEach((c) => existentes.set(c.caminho, c))
      }
      for (const n of doNivel) {
        const e = existentes.get(n.caminho)!
        if (!novos.includes(n) && n.faixa && e.faixa !== n.faixa) {
          await tx.productCategory.update({ where: { id: e.id }, data: { faixa: n.faixa } })
          r.categorias.atualizadas++
        }
      }
    }
  }

  await auditar('import.base', 'Import', sha, {
    arquivo: opts.arquivo ?? null,
    simulado: !!opts.simular,
    contas: r.contas,
    contatos: r.contatos,
    oportunidades: r.oportunidades,
    notas: r.notas,
    produtos: r.produtos,
    categorias: r.categorias,
    usuariosCriados: r.usuariosCriados,
    origensCriadas: r.origensCriadas,
    avisos: r.avisos.length,
  })

  if (opts.simular) throw new Simulacao(r)
  return r
}
