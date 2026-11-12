import { z } from 'zod'

export const partnerSchema = z.object({
  nome: z.string().trim().min(2, 'Nome obrigatório').max(120),
  contato: z.string().trim().max(200).nullable().optional(),
  feePorc: z.coerce.number().min(0, 'Fee entre 0 e 100%').max(100, 'Fee entre 0 e 100%'),
  ativo: z.boolean().optional(),
})

export const TIPOS_ORIGEM = ['MIDIA', 'PARCEIRO', 'INDICACAO', 'PROSPECCAO', 'EVENTO', 'OUTRO'] as const
export const originSchema = z.object({
  nome: z.string().trim().min(2, 'Nome obrigatório').max(120),
  tipo: z.enum(TIPOS_ORIGEM),
  parceiroId: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
})

export const CATALOG_TIPOS = ['CATEGORIA', 'UF', 'RELATORIO', 'TIPO_MIDIA', 'PRACA', 'FONTE_INFO'] as const
export const catalogSchema = z.object({
  tipo: z.enum(CATALOG_TIPOS),
  nome: z.string().trim().min(1, 'Nome obrigatório').max(120),
  codigo: z.string().trim().max(20).nullable().optional(),
  ordem: z.coerce.number().int().min(0).optional(),
  ativo: z.boolean().optional(),
})

const papel = z.enum(['ADMIN', 'DIRETOR', 'GERENTE', 'VENDEDOR'])
const segmento = z.enum(['VAREJO', 'INDUSTRIA']).nullable()
const porc = z.coerce.number().min(0, 'Valor entre 0 e 100%').max(100, 'Valor entre 0 e 100%')

export const discountSchema = z.object({
  items: z.array(z.object({ papel, segmento, tetoPorc: porc.nullable() })).min(1),
})

export const conversionSchema = z.object({
  items: z.array(z.object({ stageId: z.string(), segmento, taxaPorc: porc })).min(1),
})

// Produto/serviço do catálogo (sem preço na v1).
export const productSchema = z.object({
  codigo: z.string().trim().min(2, 'Código obrigatório').max(30).transform((s) => s.toUpperCase()),
  nome: z.string().trim().min(2, 'Nome obrigatório').max(120),
  tipo: z.enum(['PRODUTO', 'SERVICO']),
  segmento: z.enum(['VAREJO', 'INDUSTRIA']).nullable(),
  tipoMidia: z.string().trim().max(60).nullable(),
  descricao: z.string().trim().max(2000).nullable(),
  ativo: z.boolean(),
})
