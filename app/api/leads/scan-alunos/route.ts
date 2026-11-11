export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

// IDs das tags de aluno no OpaSuite
const ALUNO_TAG_IDS = new Set([
  '69eb439dc0ca6245f331006f', // Aluna MG
  '69eb43b0a4eff3b37ca061cc', // Aluno
  '69eb43d30669d3eb941abda3', // Aluno Cri-Cri - Seja Paciente
  '69eb43dc515b219fd44da0b5', // Aluno DRM
  '69eb43e5c0ca6245f3310091', // Aluno em Reserva
  '69eb43eea4eff3b37ca061e0', // Aluno PR
  '69eb43f60669d3eb941abdb6', // Aluno RJ
])

// POST: Scan retroativo — busca TODOS os atendimentos na API OpaSuite
// em uma única chamada (até 1000), filtra os que têm tags de aluno,
// e cruza com os leads do banco pelo conversationId ou telefone.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const baseUrl = process.env.OPASUITE_API_URL
  const token = process.env.OPASUITE_API_TOKEN
  if (!baseUrl || !token) {
    return NextResponse.json({ error: 'API OpaSuite não configurada' }, { status: 400 })
  }

  try {
    // 1. Busca todos os atendimentos da API (limite é 1000)
    const res = await fetch(`${baseUrl}/atendimento?limit=1000`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `API retornou status ${res.status}` }, { status: 502 })
    }
    const apiResult = await res.json()
    const atendimentos: any[] = Array.isArray(apiResult?.data) ? apiResult.data : (Array.isArray(apiResult) ? apiResult : [])

    // 2. Filtra atendimentos com tag de aluno e coleta seus telefones
    const alunoPhones = new Set<string>()
    const alunoConversationIds = new Set<string>()

    for (const atend of atendimentos) {
      const tags: any[] = Array.isArray(atend?.tags) ? atend.tags : []
      const hasAluno = tags.some((t: any) => {
        const tagId = typeof t === 'string' ? t : t?.id_tag
        return tagId && ALUNO_TAG_IDS.has(tagId)
      })
      if (!hasAluno) continue

      // Coleta o ID do atendimento
      if (atend._id) alunoConversationIds.add(atend._id)

      // Coleta o telefone normalizado
      const ch = atend.canal_cliente ?? ''
      if (typeof ch === 'string' && ch) {
        const digits = ch.split('@')[0].replace(/\D/g, '')
        if (digits.length >= 10) alunoPhones.add(digits)
      }
    }

    if (alunoPhones.size === 0 && alunoConversationIds.size === 0) {
      return NextResponse.json({
        totalAtendimentos: atendimentos.length,
        alunosEncontrados: 0,
        marked: 0,
      })
    }

    // 3. Busca leads no banco que correspondam (por telefone OU conversationId)
    const conditions: any[] = []
    if (alunoPhones.size > 0) {
      conditions.push({ phoneNormalized: { in: Array.from(alunoPhones) } })
    }
    if (alunoConversationIds.size > 0) {
      conditions.push({ opasuiteConversationId: { in: Array.from(alunoConversationIds) } })
    }

    const matchingLeads = await prisma.lead.findMany({
      where: {
        isAluno: false,
        OR: conditions,
      },
      select: { id: true },
    })

    // 4. Atualiza todos de uma vez
    let marked = 0
    if (matchingLeads.length > 0) {
      const result = await prisma.lead.updateMany({
        where: { id: { in: matchingLeads.map(l => l.id) } },
        data: { isAluno: true, status: 'ALUNO' as any },
      })
      marked = result.count
    }

    return NextResponse.json({
      totalAtendimentos: atendimentos.length,
      alunosEncontrados: alunoPhones.size + alunoConversationIds.size,
      matched: matchingLeads.length,
      marked,
    })
  } catch (e: any) {
    console.error('[SCAN_ALUNOS] erro:', e.message)
    return NextResponse.json({ error: e.message ?? 'Erro interno' }, { status: 500 })
  }
}
