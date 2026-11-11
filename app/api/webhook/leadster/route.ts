export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parsePhone } from '@/lib/phone-utils'
import { classifyChannel } from '@/lib/channel-utils'
import { sendLeadIdentifiedEvent, sendQualifiedLeadEvent } from '@/lib/meta-capi'
import { matchesViraTecnicoText } from '@/lib/vira-tecnico-utils'

/**
 * Webhook da Leadster — recebe leads capturados pelo chatbot.
 *
 * Formato mapeado (campos renomeados na Leadster):
 * { "method": "POST", "body": { "name": "...", "phone": "...", "email": "..." } }
 *
 * Formato padrão (sem mapeamento):
 * { "lead": { "id": "...", "data": { "nome": "...", "telefone": "..." }, "script": { "name": "..." }, ... } }
 *
 * Também aceita payload flat: { "name": "...", "phone": "...", ... }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    console.log('[LEADSTER_WEBHOOK] payload recebido:', JSON.stringify(body).slice(0, 2000))

    // Extrai dados do lead — suporta vários formatos
    const mapped = body?.body ?? body // formato mapeado ou flat
    const leadObj = body?.lead ?? {} // formato padrão
    const leadData = leadObj?.data ?? {}

    const phone =
      mapped?.phone ?? mapped?.telefone ?? mapped?.numero ?? mapped?.whatsapp ??
      leadData?.telefone ?? leadData?.phone ?? leadData?.celular ?? leadData?.whatsapp ??
      extractPhoneFromLeadData(body?.lead?.lead_data) ?? ''

    const name =
      mapped?.name ?? mapped?.nome ??
      leadData?.nome ?? leadData?.name ?? null

    const email =
      mapped?.email ?? mapped?.e_mail ??
      leadData?.email ?? leadData?.e_mail ?? null

    const scriptName = leadObj?.script?.name ?? mapped?.script ?? mapped?.campaign ?? null
    const leadsterId = leadObj?.id ?? body?.id ?? null

    // Extrai dados de origem/anúncio (UTMs e URL da página)
    // A Leadster envia a URL da página com UTMs no campo "url" ou em lead_data (key "9999::URL")
    const pageUrl =
      mapped?.url ?? leadData?.url ??
      extractValueFromLeadData(body?.lead?.lead_data, ['url']) ?? null

    // UTMs podem vir como campos mapeados diretos, em lead_data, ou dentro da URL
    const utmSource =
      mapped?.utm_source ?? leadData?.utm_source ??
      extractValueFromLeadData(body?.lead?.lead_data, ['utm_source', 'source']) ??
      extractUtmFromUrl(pageUrl, 'utm_source')
    const utmMedium =
      mapped?.utm_medium ?? leadData?.utm_medium ??
      extractValueFromLeadData(body?.lead?.lead_data, ['utm_medium', 'medium']) ??
      extractUtmFromUrl(pageUrl, 'utm_medium')
    const utmCampaign =
      mapped?.utm_campaign ?? leadData?.utm_campaign ??
      extractValueFromLeadData(body?.lead?.lead_data, ['utm_campaign', 'campaign']) ??
      extractUtmFromUrl(pageUrl, 'utm_campaign')
    const utmContent =
      mapped?.utm_content ?? leadData?.utm_content ??
      extractValueFromLeadData(body?.lead?.lead_data, ['utm_content']) ??
      extractUtmFromUrl(pageUrl, 'utm_content')
    const utmTerm =
      mapped?.utm_term ?? leadData?.utm_term ??
      extractValueFromLeadData(body?.lead?.lead_data, ['utm_term']) ??
      extractUtmFromUrl(pageUrl, 'utm_term')
    const fbclid =
      mapped?.fbclid ?? leadData?.fbclid ??
      extractUtmFromUrl(pageUrl, 'fbclid')
    const gclid =
      mapped?.gclid ?? leadData?.gclid ??
      extractUtmFromUrl(pageUrl, 'gclid')
    const gbraid =
      mapped?.gbraid ?? leadData?.gbraid ??
      extractUtmFromUrl(pageUrl, 'gbraid')
    const wbraid =
      mapped?.wbraid ?? leadData?.wbraid ??
      extractUtmFromUrl(pageUrl, 'wbraid')
    // Consolida gclid (gclid > gbraid > wbraid)
    const effectiveGclid = gclid ?? gbraid ?? wbraid ?? null

    // Monta título do anúncio a partir dos UTMs
    const adTitle = utmCampaign
      ? [utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ')
      : null
    const adUrl = pageUrl
    const campaignId = utmCampaign ?? fbclid ?? effectiveGclid ?? null
    const channel = classifyChannel(utmSource, utmMedium, !!fbclid, false, !!effectiveGclid)

    // Vira Técnico: detecta o slug "viratecnico" na página/campanha/UTMs.
    const hasViraTecnico = matchesViraTecnicoText(pageUrl, scriptName, utmCampaign, utmContent, adUrl)

    console.log('[LEADSTER_WEBHOOK] origem:', { utmSource, utmMedium, utmCampaign, utmContent, utmTerm, fbclid, gclid: effectiveGclid, pageUrl })

    // Log de headers para diagnóstico
    const headersObj: Record<string, string> = {}
    req.headers.forEach((v, k) => { headersObj[k] = v })

    async function logWebhook(leadSaved: boolean, note: string) {
      try {
        await prisma.webhookLog.create({
          data: {
            source: 'leadster',
            payload: JSON.stringify(body).slice(0, 10000),
            headers: JSON.stringify(headersObj).slice(0, 4000),
            phoneFound: phone ? String(phone) : null,
            leadSaved,
            note,
          },
        })
        // Mantém apenas os 50 registros mais recentes por fonte
        const old = await prisma.webhookLog.findMany({
          where: { source: 'leadster' },
          orderBy: { createdAt: 'desc' },
          skip: 50,
          select: { id: true },
        })
        if (old.length) await prisma.webhookLog.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
      } catch (e) {
        console.error('[LEADSTER_WEBHOOK] falha ao gravar log:', e)
      }
    }

    if (!phone) {
      console.warn('[LEADSTER_WEBHOOK] telefone não encontrado no payload')
      await logWebhook(false, 'Telefone não encontrado no payload')
      return NextResponse.json({ status: 'ok', message: 'no phone' }, { status: 200 })
    }

    // Load allowed DDDs
    const dddsSetting = await prisma.setting.findUnique({ where: { key: 'allowed_ddds' } })
    let allowedDdds: Set<string> | undefined
    if (dddsSetting?.value) {
      try {
        const arr = JSON.parse(dddsSetting.value)
        if (Array.isArray(arr)) allowedDdds = new Set(arr.map(String))
      } catch {}
    }

    const parsed = parsePhone(String(phone), allowedDdds)
    const upsertKey = parsed.normalized ?? parsed.raw

    // Auto-qualificação
    const autoSetting = await prisma.setting.findUnique({ where: { key: 'auto_qualify' } })
    const autoQualify = autoSetting?.value !== 'false'

    const existing = await prisma.lead.findUnique({ where: { phoneNormalized: upsertKey } })

    if (existing) {
      // Lead já existe (pode ter vindo do OpaSuite ou de outra fonte)
      await prisma.lead.update({
        where: { phoneNormalized: upsertKey },
        data: {
          name: name ?? undefined,
          campaignName: scriptName ?? undefined,
          // Atualiza dados de anúncio se encontrados e lead ainda não tem
          ...(!existing.adId && campaignId ? { adId: campaignId, adTitle, adUrl } : {}),
          ...(!existing.utmSource && utmSource ? { utmSource, utmMedium: utmMedium ?? null } : {}),
          ...(!existing.utmCampaign && utmCampaign ? { utmCampaign } : {}),
          ...(!existing.utmContent && utmContent ? { utmContent } : {}),
          ...(!existing.utmTerm && utmTerm ? { utmTerm } : {}),
          ...(!existing.gclid && effectiveGclid ? { gclid: effectiveGclid } : {}),
          ...(!existing.fbclid && fbclid ? { fbclid } : {}),
          ...(!existing.channel ? { channel } : {}),
          ...(hasViraTecnico ? { viraTecnico: true } : {}),
        },
      })
      await logWebhook(true, `Lead atualizado (já existia via ${existing.source}, status ${existing.status})`)
      return NextResponse.json({ status: 'ok', updated: true }, { status: 200 })
    }

    // Lead novo
    const created = await prisma.lead.create({
      data: {
        phoneRaw: parsed.raw,
        phoneNormalized: upsertKey,
        ddi: parsed.ddi,
        ddd: parsed.ddd,
        name,
        campaignId: campaignId,
        campaignName: scriptName ?? utmCampaign,
        messageFirst: email ? `E-mail: ${email}` : null,
        status: parsed.status as any,
        source: 'leadster',
        isNewConversation: true,
        adId: campaignId,
        adTitle,
        adUrl,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        utmContent: utmContent ?? null,
        utmTerm: utmTerm ?? null,
        gclid: effectiveGclid ?? null,
        fbclid: fbclid ?? null,
        channel,
        viraTecnico: hasViraTecnico,
      },
    })

    // Evento 'Lead' (topo do funil) na criação de lead de origem Meta.
    if (created.channel === 'pago_meta' && !created.metaLeadEventSent) {
      const leadEvt = await sendLeadIdentifiedEvent(created.id, { phone: upsertKey, name: created.name, externalId: created.id })
      await prisma.lead.update({
        where: { id: created.id },
        data: {
          metaLeadEventSent: leadEvt.success,
          metaLeadEventId: leadEvt.eventId,
          metaLeadEventError: leadEvt.error ?? null,
          metaLeadEventSentAt: leadEvt.success ? new Date() : null,
        },
      })
    }
    // Auto-qualificar se habilitado e lead válido
    if (autoQualify && parsed.status === 'NOVO') {
      const metaResult = await sendQualifiedLeadEvent(created.id, { phone: upsertKey, name: created.name, externalId: created.id })
      await prisma.lead.update({
        where: { id: created.id },
        data: {
          status: 'QUALIFICADO',
          metaEventSent: metaResult.success,
          metaEventId: metaResult.eventId,
          metaEventError: metaResult.error ?? null,
          metaEventSentAt: metaResult.success ? new Date() : null,
        },
      })
      await logWebhook(true, `Lead qualificado automaticamente e ${metaResult.success ? 'enviado à Meta' : 'FALHA Meta'}${scriptName ? ` (script: ${scriptName})` : ''}`)
      return NextResponse.json({ status: 'ok', autoQualified: true, metaSent: metaResult.success }, { status: 200 })
    }

    await logWebhook(true, `Lead salvo (status ${parsed.status}${scriptName ? `, script: ${scriptName}` : ''})`)
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err: any) {
    console.error('[LEADSTER_WEBHOOK] erro:', err)
    return NextResponse.json({ status: 'ok', error: 'internal' }, { status: 200 })
  }
}

/** Extrai telefone do array lead_data da Leadster (formato não-mapeado) */
function extractPhoneFromLeadData(leadData: any[]): string | null {
  if (!Array.isArray(leadData)) return null
  const phoneKeys = ['telefone', 'phone', 'celular', 'whatsapp', 'numero']
  for (const entry of leadData) {
    const key = (entry?.key ?? '').toLowerCase()
    if (phoneKeys.some(k => key.includes(k)) && entry?.value) {
      return String(entry.value)
    }
  }
  return null
}

/** Extrai valor genérico do array lead_data pelo nome da chave */
function extractValueFromLeadData(leadData: any[], keys: string[]): string | null {
  if (!Array.isArray(leadData)) return null
  for (const entry of leadData) {
    const key = (entry?.key ?? '').toLowerCase()
    if (keys.some(k => key.includes(k)) && entry?.value) {
      return String(entry.value)
    }
  }
  return null
}

/** Extrai parâmetro UTM de uma URL */
function extractUtmFromUrl(url: string | null, param: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.searchParams.get(param) ?? null
  } catch {
    // Tenta extrair via regex se URL for parcial
    const match = url.match(new RegExp(`[?&]${param}=([^&]+)`))
    return match ? decodeURIComponent(match[1]) : null
  }
}

export async function GET() {
  return NextResponse.json({ status: 'active', message: 'Webhook Leadster ativo' })
}
