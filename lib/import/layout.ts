// Layout do arquivo padrão de importação (XLSX). Conversor e importador usam as mesmas colunas.
// A coluna "Chave" identifica o registro entre importações: reimportar o mesmo arquivo atualiza, não duplica.

export const ABAS = {
  empresas: 'Empresas',
  contatos: 'Contatos',
  oportunidades: 'Oportunidades',
  notas: 'Notas',
  produtos: 'Produtos',
  categorias: 'Categorias',
  pendencias: 'Pendências',
  leiame: 'Leia-me',
} as const

export const COLS = {
  empresas: ['Chave', 'Razão social', 'Nome fantasia', 'CNPJ', 'CNPJ provisório', 'Segmento', 'Situação', 'Origem', 'Vendedor (e-mail)', 'Pendências'],
  contatos: ['Chave', 'Chave empresa', 'Nome', 'Telefone', 'E-mail', 'Cargo', 'Área', 'Papel', 'Pendências'],
  oportunidades: ['Chave', 'Chave empresa', 'Etapa', 'Tipo', 'Previsão de fechamento', 'Vendedor (e-mail)', 'Pendências'],
  notas: ['Chave', 'Chave empresa', 'Chave oportunidade', 'Texto'],
  produtos: ['Código', 'Nome', 'Tipo', 'Segmento', 'Tipo de mídia', 'Descrição', 'Ativo'],
  categorias: ['Caminho', 'Departamento', 'Categoria', 'Subcategoria', 'Item', 'Faixa'],
  pendencias: ['Aba', 'Chave', 'Empresa', 'Pendência'],
} as const

export const SEGMENTO_IN: Record<string, 'VAREJO' | 'INDUSTRIA'> = { varejo: 'VAREJO', industria: 'INDUSTRIA', indústria: 'INDUSTRIA' }
export const SEGMENTO_OUT = { VAREJO: 'Varejo', INDUSTRIA: 'Indústria' } as const
export const SITUACAO_IN: Record<string, 'PROSPECT' | 'CLIENTE'> = { prospect: 'PROSPECT', cliente: 'CLIENTE' }
export const TIPO_OPOR_IN: Record<string, 'NOVA_VENDA' | 'UPGRADE' | 'RENOVACAO'> = {
  'nova venda': 'NOVA_VENDA',
  upgrade: 'UPGRADE',
  'renovação': 'RENOVACAO',
  renovacao: 'RENOVACAO',
}
export const PAPEL_PESSOA_IN: Record<string, 'DECISOR' | 'INFLUENCIADOR' | 'USUARIO' | 'CLIENTE_INTERNO' | 'PAGADOR' | 'OPOSITOR'> = {
  decisor: 'DECISOR',
  influenciador: 'INFLUENCIADOR',
  'usuário': 'USUARIO',
  usuario: 'USUARIO',
  'cliente interno': 'CLIENTE_INTERNO',
  pagador: 'PAGADOR',
  opositor: 'OPOSITOR',
}
export const TIPO_PRODUTO_IN: Record<string, 'PRODUTO' | 'SERVICO'> = { produto: 'PRODUTO', 'serviço': 'SERVICO', servico: 'SERVICO' }

export const LEIA_ME = [
  'Arquivo padrão de importação do Funil Comercial.',
  '',
  'Como funciona',
  '• Cada aba é um tipo de cadastro. Não renomeie abas nem colunas.',
  '• "Chave" identifica o registro: reimportar o arquivo atualiza o que já existe em vez de duplicar.',
  '• Contatos, oportunidades e notas apontam para a empresa pela coluna "Chave empresa".',
  '• CNPJ: 14 dígitos. Sem CNPJ real, use um CNPJ provisório 9999NNNN/0000-00 e marque "CNPJ provisório" = Sim;',
  '  a conta fica sinalizada até alguém informar o CNPJ real (tela Contas).',
  '• Telefone com DDD (o DDI 55 é acrescentado). Datas em DD/MM/AAAA.',
  '• Segmento: Varejo ou Indústria. Situação: Prospect ou Cliente.',
  '• Tipo de oportunidade: Nova venda, Upgrade ou Renovação. Etapa: nome exato da coluna do funil.',
  '• A coluna "Pendências" explica o que precisa de revisão. Ela não é importada.',
  '• Produtos não têm preço: o motor de precificação fica fora da v1.',
]
