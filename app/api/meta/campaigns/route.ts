export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const META_ADS_TOKEN = process.env.META_ADS_TOKEN ?? process.env.META_CAPI_TOKEN ?? ''
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID ?? ''

interface MetaCampaign {
  id: string
  name: string
  status: string
  effective_status: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!META_AD_ACCOUNT_ID || !META_ADS_TOKEN) {
    return NextResponse.json({ configured: false, campaigns: [] }, { status: 200 })
  }

  const accountId = META_AD_ACCOUNT_ID.startsWith('act_')
    ? META_AD_ACCOUNT_ID
    : `act_${META_AD_ACCOUNT_ID}`

  try {
    const params = new URLSearchParams({
      fields: 'id,name,status,effective_status',
      limit: '500',
      access_token: META_ADS_TOKEN,
    })
    let url: string | undefined =
      `https://graph.facebook.com/v21.0/${accountId}/campaigns?${params.toString()}`

    const all: MetaCampaign[] = []
    while (url) {
      const res = await fetch(url, { next: { revalidate: 0 } })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      if (Array.isArray(json.data)) all.push(...json.data)
      url = json.paging?.next
    }

    const campaigns = all.map((c) => {
      const eff = c.effective_status || c.status || ''
      return {
        id: c.id,
        name: c.name,
        status: eff,
        active: eff === 'ACTIVE',
      }
    })

    // Ativas primeiro, depois por nome
    campaigns.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ configured: true, campaigns })
  } catch (e: any) {
    console.error('[META_CAMPAIGNS] erro:', e?.message)
    return NextResponse.json(
      { configured: true, campaigns: [], error: e?.message || 'Erro ao buscar campanhas' },
      { status: 200 },
    )
  }
}
