// Converte as planilhas legadas da Shopping Brasil para o arquivo padrão de importação (lib/import/layout.ts).
//
//   yarn import:converter --controle "<Controle de Tarefas.xlsx>" --base "<Base precificação.xlsx>" \
//       --varejo "<precificaçãoVarejo2026.xlsx>" --vendedor marcus.sevilhano@shoppingbrasil.com.br --out Importacao_Base_Inicial.xlsx
//
// Lê SOMENTE a aba "Status 2026 Atualizado" do controle de tarefas (decisão do cliente).
// Das planilhas de precificação aproveita só a estrutura (mídias, pacotes e árvore de categorias): nenhum preço é exportado.
import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import { ABAS, COLS, LEIA_ME, SEGMENTO_OUT } from '../../lib/import/layout'
import { cnpjFantasma, contemCredencial, formatCnpj, normalizeEmail, normalizeName, normalizePhone, splitMulti } from '../../lib/import/normalize'

const ABA_CONTROLE = 'Status 2026 Atualizado'

// ---------- regras de negócio aprovadas ----------

// Fase da planilha → coluna do funil (preset v1).
const FASE_ETAPA: Record<string, string> = {
  apresentar: 'Diagnóstico/Apresentação',
  proposta: 'Proposta Comercial',
  fup: 'Negociação',
  documentacao: 'Fechamento',
  reversao: 'Negociação',
}
const ORDEM_ETAPA = ['Prospecção', 'Qualificação', 'Diagnóstico/Apresentação', 'Teste/Piloto', 'Proposta Comercial', 'Negociação', 'Fechamento', 'Perda']

// Grafias diferentes da mesma empresa dentro da planilha (nome normalizado → nome canônico).
const ALIASES: Record<string, string> = {
  hiperbom: 'Hiperbom / HiperSelect',
  g2: 'G2 Atacadista (Bebidas)',
  lopes: 'Lopes Supermercados',
  adonai: 'Adonai Supermercados',
  minerva: 'Minerva Foods',
}

// Segmento por empresa (a planilha não tem essa coluna). Não listadas → Varejo + pendência.
const INDUSTRIA = new Set(
  [
    'Pepsico', 'TCL', 'Minerva Foods', 'Ambev', 'Vigor', 'Suzano', 'Marilan', 'Mars Snacking', 'M Dias Branco', 'Azeites Gallo',
    'Del Moro', 'Bracell', 'Lactalis', 'Heineken', 'Danone', 'Predilecta', 'Procter & Gamble', 'JDE', 'Melittta', 'Ferrero',
    'Vida Veig', 'Moinho Globo', 'Unilever', 'Nestle', 'Laticícios Scala', 'Granja Faria', 'Motorola', 'Fruki', 'Baly',
  ].map(normalizeName),
)
const VAREJO = new Set(
  [
    'Supermercado Baklizi', 'Atacado Dia a Dia', 'Hiperbom / HiperSelect', 'Supermercado San Sato', 'Hirota', 'Rede Top', 'Super Nosso',
    'Rede Mix', 'Novo Mateus', 'Giga Supermercados', 'Lopes Supermercados', 'Adonai Supermercados', 'Unisuper', 'Semar',
    'G2 Atacadista (Bebidas)', 'Super DB', 'Grupo Pereira', 'Negreiros', 'Assai', 'UnidaSul', 'Casa Rena', 'SuperMarket', 'Atacadão',
    'Mateus', 'Mundial Mix', 'Koch', 'Comercial Zaffari', 'BOA Supermercados', 'Atakadão', 'Super São Vicente', 'Mercado Quadrado',
    'Casas Bahia', 'Super do Povo (Valbeni)', 'Avenida', 'Hiper Queiroz', 'Super Barbosa (Polyne)', 'Tenda', 'Rossi', 'Condor',
  ].map(normalizeName),
)

// ---------- utilidades ----------

function arg(name: string, obrigatorio = true): string {
  const i = process.argv.indexOf(`--${name}`)
  const v = i > -1 ? process.argv[i + 1] : undefined
  if (!v && obrigatorio) throw new Error(`Informe --${name}`)
  return v ?? ''
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if ('text' in v) return String((v as any).text)
    if ('result' in v) return cellText((v as any).result)
    return ''
  }
  return String(v)
}

const brDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)

interface Empresa {
  chave: string
  nome: string
  cnpj: string
  segmento: 'VAREJO' | 'INDUSTRIA'
  situacao: 'PROSPECT' | 'CLIENTE'
  origem: string
  pend: string[]
  linhas: number[]
}
interface Contato { chave: string; empresa: string; nome: string; telefone: string; email: string; pend: string[] }
interface Oportunidade { chave: string; empresa: string; etapa: string; tipo: string; previsao: string; pend: string[] }
interface Nota { chave: string; empresa: string; oportunidade: string; texto: string }

// ---------- leitura do controle de tarefas ----------

async function converterControle(path: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet(ABA_CONTROLE)
  if (!ws) throw new Error(`Aba "${ABA_CONTROLE}" não encontrada em ${path}`)

  const empresas = new Map<string, Empresa>()
  const contatos = new Map<string, Contato>()
  const oportunidades = new Map<string, Oportunidade>()
  const notas = new Map<string, Nota>()
  const avisosGerais: string[] = []
  let seq = 0

  ws.eachRow((row, n) => {
    if (n === 1) return
    const c = (i: number) => cellText(row.getCell(i).value).trim()
    const valores = Array.from({ length: 15 }, (_, i) => c(i + 1))
    if (!valores.some(Boolean)) return
    const [tema0, respSb, empresaCol, status, nomes, , , fase] = valores
    // Sem trim no início: "   \nfulano@x.com" significa "1º contato sem e-mail, 2º com e-mail".
    const bruto = (i: number) => cellText(row.getCell(i).value).replace(/\s+$/, '')
    const fones = bruto(6)
    const emails = bruto(7)
    const dataRaw = row.getCell(9).value
    const obs = valores.slice(9, 15).filter(Boolean)

    // Sem "Empresa", a planilha usa a coluna "Tema" como nome da empresa.
    // "Condor - Up TV" / "RFK - UP": o sufixo indica upgrade, não faz parte do nome da empresa.
    const nomeOriginal = empresaCol || tema0
    const tema = empresaCol ? tema0 : ''
    const semSufixo = nomeOriginal.replace(/\s*-\s*up\b.*$/i, '').trim()
    const nome = ALIASES[normalizeName(semSufixo)] ?? semSufixo
    const chave = `emp:${normalizeName(nome)}`
    const temaN = normalizeName(tema)

    let emp = empresas.get(chave)
    if (!emp) {
      const nn = normalizeName(nome)
      const segmento = INDUSTRIA.has(nn) ? 'INDUSTRIA' : 'VAREJO'
      emp = { chave, nome, cnpj: cnpjFantasma(++seq), segmento, situacao: 'PROSPECT', origem: '', pend: [], linhas: [] }
      emp.pend.push('CNPJ provisório: informar o CNPJ real')
      if (!INDUSTRIA.has(nn) && !VAREJO.has(nn)) emp.pend.push('segmento não identificado (assumido Varejo): confirmar')
      empresas.set(chave, emp)
    } else {
      emp.pend.push(`unificada com a linha ${n} da planilha ("${nomeOriginal}")`)
    }
    if (nomeOriginal.trim() !== nome) emp.pend.push(`"${nomeOriginal.trim()}" (linha ${n}) unificada em "${nome}": confirmar`)
    emp.linhas.push(n)

    const ehCliente = /retencao|upgrade|renovacao|reversao/.test(temaN) || /\bup\b/i.test(nomeOriginal) || /^upgrade/i.test(obs[0] ?? '')
    if (ehCliente) emp.situacao = 'CLIENTE'
    if (/tradeconnection/.test(temaN)) emp.origem = 'Trade Connection'
    else if (temaN === 'prospeccao' && !emp.origem) emp.origem = 'Prospecção ativa'
    if (/neogrid/i.test(respSb)) emp.pend.push(`"Responsável SB" cita Neogrid (${respSb}): verificar se é parceiro`)

    // Oportunidade (uma por empresa; vale a etapa mais avançada entre as linhas).
    const etapaFase = FASE_ETAPA[normalizeName(fase)]
    const statusN = normalizeName(status)
    if (statusN === 'concluida' && !fase) {
      emp.situacao = 'CLIENTE' // concluída sem fase = cliente ativo, sem cartão aberto
    } else {
      const etapa = statusN === 'rejeitado' ? 'Perda' : etapaFase ?? 'Prospecção'
      const tipo = /upgrade/.test(temaN) || /\bup\b/i.test(nomeOriginal) || /^upgrade/i.test(obs[0] ?? '') ? 'Upgrade'
        : /retencao|renovacao|reversao/.test(temaN) ? 'Renovação' : 'Nova venda'
      const chaveOp = `op:${chave.slice(4)}`
      const op = oportunidades.get(chaveOp) ?? { chave: chaveOp, empresa: chave, etapa, tipo, previsao: '', pend: [] }
      if (ORDEM_ETAPA.indexOf(etapa) > ORDEM_ETAPA.indexOf(op.etapa)) op.etapa = etapa
      if (!fase && !oportunidades.has(chaveOp)) op.pend.push('sem fase na planilha: entrou em Prospecção')
      if (fase && !etapaFase) op.pend.push(`fase "${fase}" sem correspondência: entrou em Prospecção`)
      if (op.etapa === 'Fechamento') op.pend.push('Fase "Documentação" → Fechamento (etapa de ganho): contrato ainda não assinado? confirmar')
      if (dataRaw instanceof Date) op.previsao = brDate(dataRaw)
      else if (cellText(dataRaw).trim()) op.pend.push(`data de conclusão em texto ("${cellText(dataRaw).trim()}"): deixada em branco`)
      if (statusN === 'rejeitado') op.pend.push('status "Rejeitado": informar o motivo da perda')
      oportunidades.set(chaveOp, op)
    }
    const chaveOp = oportunidades.has(`op:${chave.slice(4)}`) ? `op:${chave.slice(4)}` : ''

    // Contatos: células com vários nomes/telefones/e-mails são alinhadas pela posição.
    const listaNomes = splitMulti(nomes, { porE: true })
    const listaFones = splitMulti(fones).filter((x) => x.replace(/\D/g, ''))
    const listaEmails = splitMulti(emails)
    listaNomes.forEach((nomePessoa, i) => {
      if (!nomePessoa) return
      const pend: string[] = []
      const fone = listaFones[i] ?? (listaNomes.length === 1 ? listaFones[0] : '') ?? ''
      const p = fone ? normalizePhone(fone) : { digits: '', ok: true as boolean, aviso: undefined as string | undefined }
      if (p.aviso) pend.push(p.aviso)
      const brutoEmail = (listaEmails[i] ?? '').trim() || (listaNomes.length > 1 && i === 0 ? '' : '')
      const e = brutoEmail ? normalizeEmail(brutoEmail) : { email: null as string | null }
      if ((e as any).aviso) pend.push((e as any).aviso)
      if (!fone && !e.email) pend.push('contato sem telefone e sem e-mail')
      const chaveC = `pes:${chave.slice(4)}:${normalizeName(nomePessoa)}`
      const atual = contatos.get(chaveC)
      if (atual) {
        atual.telefone ||= p.digits
        atual.email ||= e.email ?? ''
        return
      }
      contatos.set(chaveC, { chave: chaveC, empresa: chave, nome: nomePessoa.replace(/\s+/g, ' '), telefone: p.digits, email: e.email ?? '', pend })
    })
    if (listaEmails.filter(Boolean).length > listaNomes.filter(Boolean).length) {
      emp.pend.push(`linha ${n}: mais e-mails que contatos (${emails.replace(/\s+/g, ' ')}): conferir`)
    }

    // Notas: um resumo da linha + uma nota por observação. Credenciais nunca são importadas.
    const resumo = [
      `Importado do Controle de Tarefas (aba ${ABA_CONTROLE}, linha ${n}).`,
      tema0 && `Tema: ${tema0}`,
      status && `Status: ${status}`,
      respSb && `Responsável SB: ${respSb}`,
      fase && `Fase: ${fase}`,
      cellText(dataRaw) && `Data de conclusão: ${dataRaw instanceof Date ? brDate(dataRaw) : cellText(dataRaw)}`,
    ].filter(Boolean).join('\n')
    for (const texto of [resumo, ...obs]) {
      if (contemCredencial(texto)) {
        avisosGerais.push(`linha ${n}: observação com credencial descartada`)
        continue
      }
      const k = `nota:${chave.slice(4)}:${hash(texto)}`
      notas.set(k, { chave: k, empresa: chave, oportunidade: chaveOp, texto })
    }
  })

  // Possíveis duplicidades que não foram unificadas automaticamente (nome contido em outro).
  const lista = [...empresas.values()]
  for (const a of lista) {
    for (const b of lista) {
      const na = normalizeName(a.nome)
      const nb = normalizeName(b.nome)
      if (a !== b && na.length >= 4 && nb.includes(na)) a.pend.push(`possível duplicidade com "${b.nome}" (mantidas separadas)`)
    }
  }
  const atac = lista.filter((e) => ['atacadao', 'atakadao'].includes(normalizeName(e.nome)))
  if (atac.length === 2) atac.forEach((e) => e.pend.push(`possível duplicidade com "${atac.find((x) => x !== e)!.nome}" (mantidas separadas)`))

  return { empresas: lista, contatos: [...contatos.values()], oportunidades: [...oportunidades.values()], notas: [...notas.values()], avisosGerais }
}

// ---------- produtos e categorias (sem preços) ----------

async function lerProdutos(basePath: string, varejoPath: string) {
  const produtos: (string | null)[][] = []
  const categorias = new Map<string, string[]>()
  const midias = new Set<string>()

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(basePath)
  const ws = wb.getWorksheet('Export')
  if (!ws) throw new Error('Aba "Export" não encontrada na base de precificação')
  let header = 0
  ws.eachRow((row, n) => {
    const v = (i: number) => cellText(row.getCell(i).value).trim()
    if (!header) {
      if (v(1) === 'TIPO' && v(2) === 'Categoria 1') header = n
      return
    }
    const [faixa, c1, c2, c3, c4, , midia] = [v(1), v(2), v(3), v(4), v(5), v(6), v(7)]
    if (!c1) return
    if (midia) midias.add(midia)
    const niveis = [c1, c2, c3, c4]
    for (let i = 1; i <= 4; i++) {
      if (!niveis[i - 1]) break
      const caminho = niveis.slice(0, i).join(' > ')
      if (!categorias.has(caminho)) {
        const linha = [caminho, ...niveis.slice(0, i), ...Array(4 - i).fill(''), i === 4 ? faixa : '']
        categorias.set(caminho, linha)
      }
    }
  })
  if (!header) throw new Error('Cabeçalho (TIPO, Categoria 1...) não encontrado na base de precificação')

  const SIGLAS = new Set(['TV', 'DPH'])
  const titulo = (s: string) =>
    s.split(/\s+/).map((w) => (SIGLAS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ')
  const codigoMidia = (m: string) => normalizeName(m).toUpperCase().slice(0, 12)
  for (const m of [...midias].sort()) {
    produtos.push([`IND-${codigoMidia(m)}`, `Monitoramento de ofertas — ${titulo(m)}`, 'Serviço', 'Indústria', titulo(m),
      `Monitoramento de ofertas em ${SIGLAS.has(m.toUpperCase()) ? m.toUpperCase() : m.toLowerCase()} por categoria (até 4 níveis) e UF.`, 'Sim'])
  }

  // Varejo: produtos = colunas da tabela (Ofertas, TV, Pacote); departamentos viram descrição.
  const wv = new ExcelJS.Workbook()
  await wv.xlsx.readFile(varejoPath)
  const sv = wv.worksheets[0]
  const tiposVarejo = new Set<string>()
  const deps: string[] = []
  sv.eachRow((row, n) => {
    const v = (i: number) => cellText(row.getCell(i).value).trim()
    if (v(1) === 'Valores Mensais') for (let i = 2; i <= row.cellCount; i++) v(i) && tiposVarejo.add(v(i).toUpperCase())
    else if (n > 2 && v(1) && !/^total/i.test(v(1)) && typeof row.getCell(2).value === 'number') deps.push(titulo(v(1)))
  })
  for (const t of tiposVarejo) {
    const pacote = t === 'PACOTE'
    produtos.push([
      `VAR-${codigoMidia(t)}`,
      pacote ? 'Pacote Ofertas + TV — Varejo' : `Monitoramento de ${t === 'TV' ? 'TV' : 'ofertas'} — Varejo`,
      'Serviço', 'Varejo', pacote ? 'Ofertas + TV' : titulo(t),
      `Por estado/região. Departamentos: ${deps.join(', ')}.`, 'Sim',
    ])
  }
  produtos.push(['SRV-IMPLANTACAO', 'Implantação', 'Serviço', '', '', 'Implantação do projeto (cobrança única).', 'Sim'])

  return { produtos, categorias: [...categorias.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR')) }
}

// ---------- escrita do arquivo padrão ----------

function addSheet(wb: ExcelJS.Workbook, nome: string, cols: readonly string[], linhas: (string | null)[][]) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow([...cols])
  ws.getRow(1).font = { bold: true }
  linhas.forEach((l) => ws.addRow(l))
  ws.columns.forEach((col, i) => {
    const max = Math.max(cols[i].length, ...linhas.slice(0, 500).map((l) => String(l[i] ?? '').split('\n')[0].length))
    col.width = Math.min(Math.max(max + 2, 10), 60)
  })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  return ws
}

async function main() {
  const out = arg('out')
  const vendedor = arg('vendedor').toLowerCase()
  const ctrl = await converterControle(arg('controle'))
  const prod = await lerProdutos(arg('base'), arg('varejo'))

  const nomeEmp = new Map(ctrl.empresas.map((e) => [e.chave, e.nome]))
  const pend: string[][] = []
  const juntar = (p: string[]) => [...new Set(p)].join('; ')

  const empresas = ctrl.empresas.map((e) => {
    e.pend.forEach((p) => pend.push(['Empresas', e.chave, e.nome, p]))
    return [e.chave, e.nome, e.nome, formatCnpj(e.cnpj), 'Sim', SEGMENTO_OUT[e.segmento], e.situacao === 'CLIENTE' ? 'Cliente' : 'Prospect', e.origem, vendedor, juntar(e.pend)]
  })
  const contatos = ctrl.contatos.map((c) => {
    c.pend.forEach((p) => pend.push(['Contatos', c.chave, nomeEmp.get(c.empresa) ?? '', `${c.nome}: ${p}`]))
    return [c.chave, c.empresa, c.nome, c.telefone, c.email, '', '', '', juntar(c.pend)]
  })
  const oportunidades = ctrl.oportunidades.map((o) => {
    const p = [...new Set(o.pend)]
    p.forEach((x) => pend.push(['Oportunidades', o.chave, nomeEmp.get(o.empresa) ?? '', x]))
    return [o.chave, o.empresa, o.etapa, o.tipo, o.previsao, vendedor, p.join('; ')]
  })
  ctrl.avisosGerais.forEach((a) => pend.push(['Notas', '', '', a]))

  const wb = new ExcelJS.Workbook()
  const leia = wb.addWorksheet(ABAS.leiame)
  LEIA_ME.forEach((l) => leia.addRow([l]))
  leia.getColumn(1).width = 120
  addSheet(wb, ABAS.empresas, COLS.empresas, empresas)
  addSheet(wb, ABAS.contatos, COLS.contatos, contatos)
  addSheet(wb, ABAS.oportunidades, COLS.oportunidades, oportunidades)
  addSheet(wb, ABAS.notas, COLS.notas, ctrl.notas.map((n) => [n.chave, n.empresa, n.oportunidade, n.texto]))
  addSheet(wb, ABAS.produtos, COLS.produtos, prod.produtos)
  addSheet(wb, ABAS.categorias, COLS.categorias, prod.categorias)
  addSheet(wb, ABAS.pendencias, COLS.pendencias, pend)
  await wb.xlsx.writeFile(out)

  console.log(JSON.stringify({
    arquivo: out,
    empresas: empresas.length,
    clientes: ctrl.empresas.filter((e) => e.situacao === 'CLIENTE').length,
    contatos: contatos.length,
    oportunidades: oportunidades.length,
    porEtapa: ctrl.oportunidades.reduce<Record<string, number>>((a, o) => ((a[o.etapa] = (a[o.etapa] ?? 0) + 1), a), {}),
    notas: ctrl.notas.length,
    produtos: prod.produtos.length,
    categorias: prod.categorias.length,
    pendencias: pend.length,
    avisos: ctrl.avisosGerais,
  }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
