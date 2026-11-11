import { z } from 'zod'

export const USER_SELECT = { id: true, name: true, email: true, papel: true, segmento: true, ativo: true, createdAt: true } as const

export const userSchema = z.object({
  name: z.string().trim().min(2, 'Nome obrigatório'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  papel: z.enum(['ADMIN', 'DIRETOR', 'GERENTE', 'VENDEDOR']),
  segmento: z.enum(['VAREJO', 'INDUSTRIA']).nullable(), // null = ambos
  password: z.string().min(10, 'Senha com no mínimo 10 caracteres'),
})

export const userPatchSchema = userSchema.partial().extend({ ativo: z.boolean().optional() })
