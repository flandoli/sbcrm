'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { AppShell } from '@/components/layouts/app-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { MessageSquare, LayoutDashboard, Settings, LogOut, Copy, Check, Wifi, WifiOff, Save, RefreshCw, History, CheckCircle2, AlertCircle, Trash2, Zap, GraduationCap, Megaphone, ShoppingCart, Send, FileBarChart } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { ThemeLogo } from '@/components/theme-logo'
import Link from 'next/link'
import { toast } from 'sonner'

export function SettingsClient() {
  const { data: session } = useSession() || {}
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [webhookCopied, setWebhookCopied] = useState(false)
  const [leadsterCopied, setLeadsterCopied] = useState(false)
  const [metaStatus, setMetaStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [testingMeta, setTestingMeta] = useState(false)
  const [backfillingMeta, setBackfillingMeta] = useState(false)
  const [testingGoogle, setTestingGoogle] = useState(false)
  const [googleStatus, setGoogleStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [testingDM, setTestingDM] = useState(false)
  const [dmStatus, setDMStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [savingDdds, setSavingDdds] = useState(false)
  const [savingSecret, setSavingSecret] = useState(false)
  const [dddText, setDddText] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [testEventCode, setTestEventCode] = useState('')
  const [savingTestCode, setSavingTestCode] = useState(false)
  const [webhookLogs, setWebhookLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [clearingLogs, setClearingLogs] = useState(false)
  const [autoQualify, setAutoQualify] = useState(true)
  const [savingAutoQualify, setSavingAutoQualify] = useState(false)
  const [scanningAlunos, setScanningAlunos] = useState(false)
  const [scanResult, setScanResult] = useState<{ totalAtendimentos: number; alunosEncontrados: number; marked: number } | null>(null)
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string; active: boolean }>>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [monitoredCampaigns, setMonitoredCampaigns] = useState<string[]>([])
  const [savingCampaigns, setSavingCampaigns] = useState(false)
  const [campaignsLoaded, setCampaignsLoaded] = useState(false)
  const [viraChannelsText, setViraChannelsText] = useState('')
  const [viraTagsText, setViraTagsText] = useState('')
  const [ssrjChannelsText, setSsrjChannelsText] = useState('')
  const [savingVira, setSavingVira] = useState(false)
  const [opaChannels, setOpaChannels] = useState<Array<{ channelId: string; channelType?: string; leads: number; webhookHits: number; lastActivity?: string; recentCustomers?: Array<{ phone: string; at: string }> }>>([])
  const [loadingOpaChannels, setLoadingOpaChannels] = useState(false)
  const [syncingVai, setSyncingVai] = useState(false)
  const [vaiResult, setVaiResult] = useState<{ ok: boolean; created?: number; skippedExisting?: number; fetched?: number; firstRun?: boolean; error?: string } | null>(null)
  const [vaiTagMapText, setVaiTagMapText] = useState('')
  const [savingVaiTagMap, setSavingVaiTagMap] = useState(false)

  useEffect(() => {
    fetchSettings()
    fetchLogs()
  }, [])

  async function fetchLogs() {
    setLoadingLogs(true)
    try {
      const res = await fetch('/api/webhook/logs')
      if (!res.ok) return
      const data = await res.json()
      setWebhookLogs(Array.isArray(data) ? data : [])
    } catch {} finally {
      setLoadingLogs(false)
    }
  }

  async function clearLogs() {
    setClearingLogs(true)
    try {
      const res = await fetch('/api/webhook/logs', { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao limpar histórico'); return }
      setWebhookLogs([])
      toast.success('Histórico de diagnóstico limpo. Novas chamadas aparecerão aqui.')
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setClearingLogs(false)
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setSettings(data ?? {})
      setDddText(data?.allowed_ddds ? JSON.parse(data.allowed_ddds).join(', ') : '')
      setWebhookSecret(data?.webhook_secret ?? '')
      setTestEventCode(data?.meta_test_event_code ?? '')
      setViraChannelsText(parseIdSetting(data?.vira_tecnico_channels))
      setViraTagsText(parseIdSetting(data?.vira_tecnico_tags))
      setSsrjChannelsText(parseIdSetting(data?.ssrj_channels))
      setAutoQualify(data?.auto_qualify !== 'false')
      setVaiTagMapText(formatVaiTagMap(data?.vaivendas_tag_channel_map))
      if (data?.monitored_campaigns) {
        try {
          const arr = JSON.parse(data.monitored_campaigns)
          if (Array.isArray(arr)) setMonitoredCampaigns(arr.map((x: any) => String(x)))
        } catch {}
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  async function fetchCampaigns() {
    setLoadingCampaigns(true)
    try {
      const res = await fetch('/api/meta/campaigns')
      const data = await res.json()
      if (data?.error) {
        toast.error(data.error)
      }
      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : [])
      setCampaignsLoaded(true)
    } catch {
      toast.error('Erro ao buscar campanhas da Meta')
    } finally {
      setLoadingCampaigns(false)
    }
  }

  function toggleCampaign(id: string) {
    setMonitoredCampaigns((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function saveCampaigns() {
    setSavingCampaigns(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'monitored_campaigns', value: JSON.stringify(monitoredCampaigns) }),
      })
      toast.success(
        monitoredCampaigns.length > 0
          ? `${monitoredCampaigns.length} campanha(s) monitorada(s) salva(s)`
          : 'Seleção limpa — usando a lista padrão',
      )
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingCampaigns(false)
    }
  }

  function getWebhookUrl(): string {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/api/webhook/opasuite`
  }

  // Converte o JSON salvo { "tag": "canal" } em linhas "tag = canal" para edição.
  function formatVaiTagMap(raw?: string): string {
    if (!raw) return ''
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object') {
        return Object.entries(obj).map(([k, v]) => `${k} = ${v}`).join('\n')
      }
    } catch {}
    return ''
  }

  async function syncVaiVendas() {
    setSyncingVai(true)
    setVaiResult(null)
    try {
      const res = await fetch('/api/vaicrm/sync', { method: 'POST' })
      const data = await res.json()
      setVaiResult(data)
      if (data?.ok) {
        if (data.firstRun) {
          toast.success('Ponto de partida definido — os próximos leads serão importados a partir de agora.')
        } else {
          toast.success(`Sincronizado: ${data.created ?? 0} novo(s), ${data.skippedExisting ?? 0} já existente(s).`)
        }
      } else {
        toast.error(data?.error ?? 'Erro na sincronização')
      }
    } catch {
      toast.error('Erro ao sincronizar com a Vai de Vendas')
    } finally {
      setSyncingVai(false)
    }
  }

  async function saveVaiTagMap() {
    setSavingVaiTagMap(true)
    try {
      // Parse das linhas "tag = canal" -> objeto JSON.
      const map: Record<string, string> = {}
      for (const line of vaiTagMapText.split('\n')) {
        const t = line.trim()
        if (!t) continue
        const idx = t.indexOf('=')
        if (idx < 0) continue
        const tag = t.slice(0, idx).trim().toLowerCase()
        const canal = t.slice(idx + 1).trim()
        if (tag && canal) map[tag] = canal
      }
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'vaivendas_tag_channel_map', value: JSON.stringify(map) }),
      })
      toast.success(Object.keys(map).length ? `${Object.keys(map).length} regra(s) de origem salva(s). Aplicando retroativamente...` : 'Mapa de origem limpo. Aplicando...')
      // Aplica imediatamente e de forma retroativa (reclassifica os leads VCRM
      // já importados conforme as novas regras de origem).
      try {
        const res = await fetch('/api/vaicrm/sync', { method: 'POST' })
        const data = await res.json()
        if (data?.ok) {
          toast.success('Origens aplicadas retroativamente aos leads da Vai de Vendas.')
        }
      } catch {}
    } catch {
      toast.error('Erro ao salvar o mapa de origem')
    } finally {
      setSavingVaiTagMap(false)
    }
  }

  function getLeadsterWebhookUrl(): string {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/api/webhook/leadster`
  }

  async function copyLeadsterWebhook() {
    try {
      await navigator.clipboard.writeText(getLeadsterWebhookUrl())
      setLeadsterCopied(true)
      toast.success('URL Leadster copiada!')
      setTimeout(() => setLeadsterCopied(false), 2000)
    } catch {
      toast.error('Erro ao copiar')
    }
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(getWebhookUrl())
      setWebhookCopied(true)
      toast.success('URL copiada!')
      setTimeout(() => setWebhookCopied(false), 2000)
    } catch {
      toast.error('Erro ao copiar')
    }
  }

  async function saveTestCode() {
    setSavingTestCode(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'meta_test_event_code', value: testEventCode }),
      })
      toast.success('Test Event Code salvo')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingTestCode(false)
    }
  }

  async function testMeta() {
    setTestingMeta(true)
    setMetaStatus(null)
    try {
      const res = await fetch('/api/meta/test', { method: 'POST' })
      const data = await res.json()
      setMetaStatus(data)
      if (data?.success) toast.success(data.message)
      else toast.error(data?.message ?? 'Falha')
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setTestingMeta(false)
    }
  }

  async function backfillMeta() {
    if (!confirm('Enviar retroativamente o funil (Lead, QualifiedLead e Purchase) à Meta para os leads e vendas de origem Meta dos últimos 60 dias? Os eventos usam IDs determinísticos, então reenvios são deduplicados pela Meta.')) return
    setBackfillingMeta(true)
    try {
      const res = await fetch('/api/meta/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 60 }),
      })
      const data = await res.json()
      if (data?.ok) {
        const r = data.result
        const rem = (r.lead.remaining ?? 0) + (r.qualified.remaining ?? 0) + (r.purchase.remaining ?? 0)
        toast.success(
          `Enviado à Meta: Lead ${r.lead.sent}, QualifiedLead ${r.qualified.sent}, Purchase ${r.purchase.sent}.` +
            (rem > 0 ? ` Ainda restam ${rem} eventos — clique novamente para continuar.` : ' Tudo enviado.'),
          { duration: 8000 },
        )
      } else {
        toast.error(data?.error ?? 'Falha no envio do histórico')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setBackfillingMeta(false)
    }
  }

  async function toggleAutoQualify(next: boolean) {
    setAutoQualify(next)
    setSavingAutoQualify(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'auto_qualify', value: String(next) }),
      })
      toast.success(next ? 'Qualificação automática ativada' : 'Qualificação automática desativada')
    } catch {
      toast.error('Erro ao salvar')
      setAutoQualify(!next)
    } finally {
      setSavingAutoQualify(false)
    }
  }

  async function saveDdds() {
    setSavingDdds(true)
    try {
      const arr = dddText.split(',').map((s: string) => s.trim()).filter((s: string) => s.length === 2)
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'allowed_ddds', value: JSON.stringify(arr) }),
      })
      toast.success(`${arr.length} DDDs salvos`)
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingDdds(false)
    }
  }

  function parseIdSetting(raw?: string): string {
    if (!raw) return ''
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.join(', ')
    } catch {}
    return raw
  }

  async function saveViraTecnico() {
    setSavingVira(true)
    try {
      const channels = viraChannelsText.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
      const tags = viraTagsText.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
      const rVira = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'vira_tecnico_channels', value: JSON.stringify(channels) }),
      })
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'vira_tecnico_tags', value: JSON.stringify(tags) }),
      })
      const ssrjChannels = ssrjChannelsText.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
      const rSsrj = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ssrj_channels', value: JSON.stringify(ssrjChannels) }),
      })
      let marked = 0
      try { marked += (await rVira.json())?.backfilled ?? 0 } catch {}
      try { marked += (await rSsrj.json())?.backfilled ?? 0 } catch {}
      toast.success(marked > 0 ? `Mapeamento salvo — ${marked} lead(s) existentes marcados` : 'Mapeamento de linhas salvo')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingVira(false)
    }
  }

  async function fetchOpaChannels() {
    setLoadingOpaChannels(true)
    try {
      const res = await fetch('/api/settings/opa-channels')
      if (!res.ok) { toast.error('Erro ao buscar canais'); return }
      const data = await res.json()
      setOpaChannels(Array.isArray(data?.channels) ? data.channels : [])
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoadingOpaChannels(false)
    }
  }

  async function saveSecret() {
    setSavingSecret(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'webhook_secret', value: webhookSecret }),
      })
      toast.success('Secret salvo')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSavingSecret(false)
    }
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-4">
        <ThemeLogo className="h-10 w-auto" />
      </div>
      <nav className="flex-1 space-y-1 mt-4">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </Link>
        <Link href="/sales" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <ShoppingCart className="h-4 w-4" /> Vendas
        </Link>
        <Link href="/reports" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-sm">
          <FileBarChart className="h-4 w-4" />
          Relatórios
        </Link>
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-medium text-sm">
          <Settings className="h-4 w-4" /> Configurações
        </Link>
      </nav>
      <div className="border-t pt-4 mt-4">
        <div className="px-3 mb-3">
          <p className="text-sm font-medium truncate">{session?.user?.name ?? 'Usuário'}</p>
          <p className="text-xs text-muted-foreground truncate">{session?.user?.email ?? ''}</p>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )

  const header = (
    <h2 className="font-display text-lg font-semibold tracking-tight">Configurações</h2>
  )

  return (
    <AppShell sidebar={sidebar} header={header}>
      <div className="space-y-6 max-w-3xl">
        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Webhook OpaSuite
            </CardTitle>
            <CardDescription>Configure esta URL no OpaSuite para receber leads automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={getWebhookUrl()} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copyWebhook}>
                {webhookCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Token de Segurança (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookSecret"
                  value={webhookSecret}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWebhookSecret(e.target.value)}
                  placeholder="Token secreto para validar requisições"
                  className="text-sm"
                />
                <Button variant="outline" size="sm" onClick={saveSecret} disabled={savingSecret}>
                  <Save className="h-4 w-4 mr-1" /> {savingSecret ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Se configurado, o OpaSuite precisa enviar este token no header <code className="font-mono bg-muted px-1 rounded">x-webhook-secret</code></p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Leadster */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">🤖</span>
              Webhook Leadster
            </CardTitle>
            <CardDescription>Configure esta URL na Leadster (Integrações → Webhook) para receber leads do chatbot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input value={getLeadsterWebhookUrl()} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copyLeadsterWebhook}>
                {leadsterCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Na Leadster: Integrações → Adicionar → Webhook → cole a URL acima → método POST → selecione o fluxo desejado.
            </p>
          </CardContent>
        </Card>

        {/* Vai de Vendas (VaiCRM) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Vai de Vendas (VaiCRM)
            </CardTitle>
            <CardDescription>
              Importa automaticamente os contatos da Vai de Vendas a cada 30 minutos. Cada contato vira um lead único (ligações e WhatsApp são eventos). Só são importados dados novos a partir da primeira sincronização — o histórico não é trazido. Leads duplicados (mesmo telefone) são ignorados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button onClick={syncVaiVendas} disabled={syncingVai}>
                {syncingVai ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Sincronizar agora</>
                )}
              </Button>
              {vaiResult && (
                <span className="text-sm text-muted-foreground">
                  {vaiResult.ok
                    ? (vaiResult.firstRun
                        ? 'Ponto de partida definido.'
                        : `${vaiResult.created ?? 0} novo(s), ${vaiResult.skippedExisting ?? 0} já existente(s) (de ${vaiResult.fetched ?? 0} verificados).`)
                    : `Erro: ${vaiResult.error ?? 'falha na sincronização'}`}
                </span>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="vai-tag-map">Origem por etiqueta (tag)</Label>
              <p className="text-sm text-muted-foreground">
                Por padrão os leads da Vai de Vendas entram como <strong>Site (http)</strong>. Crie na Vai de Vendas as mesmas etiquetas de origem que você usa no Opa — por exemplo <strong>Meta</strong> e <strong>Google</strong> — e mapeie-as aqui (uma por linha, no formato <code>etiqueta = canal</code>). Canais válidos: <code>pago_meta</code>, <code>pago_google</code>, <code>pago_outro</code>, <code>organico</code>, <code>http</code>. Já deixamos <code>meta</code>, <code>facebook</code>, <code>instagram</code> → <code>pago_meta</code> e <code>google</code> → <code>pago_google</code> pré-configurados. Ao salvar, as regras são aplicadas <strong>imediatamente e de forma retroativa</strong> a todos os leads VCRM já importados.
              </p>
              <textarea
                id="vai-tag-map"
                value={vaiTagMapText}
                onChange={(e) => setVaiTagMapText(e.target.value)}
                placeholder={'meta = pago_meta\nfacebook = pago_meta\ninstagram = pago_meta\ngoogle = pago_google'}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              />
              <Button variant="outline" onClick={saveVaiTagMap} disabled={savingVaiTagMap}>
                {savingVaiTagMap ? (
                  <><Save className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Salvar origens</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Diagnóstico do Webhook */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Diagnóstico do Webhook
                </CardTitle>
                <CardDescription className="mt-1">
                  Últimas chamadas recebidas do OpaSuite. Se estiver vazio, o OpaSuite ainda não está enviando para cá.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingLogs}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loadingLogs ? 'animate-spin' : ''}`} /> Atualizar
                </Button>
                <Button variant="outline" size="sm" onClick={clearLogs} disabled={clearingLogs || webhookLogs.length === 0}>
                  <Trash2 className={`h-4 w-4 mr-1 ${clearingLogs ? 'animate-pulse' : ''}`} /> Limpar histórico
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {webhookLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                Nenhuma chamada recebida ainda.
                <br />
                Envie uma mensagem de teste pelo WhatsApp da campanha e clique em "Atualizar".
              </div>
            ) : (
              <div className="space-y-3">
                {webhookLogs.map((log: any) => (
                  <div key={log.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {log.leadSaved ? (
                          <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/10">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Lead salvo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10">
                            <AlertCircle className="h-3 w-3 mr-1" /> Não salvo
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{log.note}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {log.phoneFound && (
                      <p className="text-xs mb-1"><span className="text-muted-foreground">Telefone detectado:</span> <span className="font-mono">{log.phoneFound}</span></p>
                    )}
                    <details>
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver dados enviados (payload)</summary>
                      <pre className="mt-2 text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">{(() => { try { return JSON.stringify(JSON.parse(log.payload), null, 2) } catch { return log.payload } })()}</pre>
                    </details>
                    {log.apiResponse && (
                      <details>
                        <summary className="text-xs text-emerald-400 cursor-pointer hover:text-emerald-300 mt-1">📡 Ver resposta da API OpaSuite (atendimento populado)</summary>
                        <pre className="mt-2 text-xs bg-emerald-950/30 border border-emerald-800/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">{(() => { try { return JSON.stringify(JSON.parse(log.apiResponse), null, 2) } catch { return log.apiResponse } })()}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Qualificação automática */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Qualificação Automática
            </CardTitle>
            <CardDescription>Quando ativada, todo novo contato de uma nova conversa que estiver dentro do DDI (+55) e da lista de DDDs autorizados é qualificado automaticamente e o evento de Lead é enviado para a Meta na hora — sem precisar qualificar manualmente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-1 pr-4">
                <p className="text-sm font-medium">Qualificar e enviar novos leads automaticamente</p>
                <p className="text-xs text-muted-foreground">
                  {autoQualify
                    ? 'Ativo: novos contatos válidos são qualificados e enviados à Meta automaticamente.'
                    : 'Desativado: os leads ficam como "Novo" aguardando qualificação manual.'}
                </p>
              </div>
              <Switch checked={autoQualify} disabled={savingAutoQualify} onCheckedChange={toggleAutoQualify} />
            </div>
          </CardContent>
        </Card>
        {/* Campanhas Monitoradas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-violet-500" />
                  Campanhas Monitoradas
                </CardTitle>
                <CardDescription className="mt-1">
                  Escolha quais campanhas aparecem no funil do painel. Clique em "Buscar campanhas" para carregar todas as campanhas da sua conta Meta e marque as que deseja acompanhar. Se nenhuma for marcada, o sistema usa a lista padrão.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchCampaigns} disabled={loadingCampaigns}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingCampaigns ? 'animate-spin' : ''}`} /> Buscar campanhas
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!campaignsLoaded ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                Clique em "Buscar campanhas" para carregar suas campanhas da Meta.
                {monitoredCampaigns.length > 0 && (
                  <div className="mt-2 text-xs">Atualmente {monitoredCampaigns.length} campanha(s) selecionada(s).</div>
                )}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                Nenhuma campanha encontrada na conta Meta.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{campaigns.length} campanha(s) na conta · {monitoredCampaigns.length} selecionada(s)</span>
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => {
                      const activeIds = campaigns.filter((c) => c.active).map((c) => c.id)
                      setMonitoredCampaigns(activeIds)
                    }}
                  >
                    Selecionar todas ativas
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1 rounded-lg border p-2">
                  {campaigns.map((c) => (
                    <label
                      key={c.id}
                      htmlFor={`camp-${c.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        id={`camp-${c.id}`}
                        checked={monitoredCampaigns.includes(c.id)}
                        onCheckedChange={() => toggleCampaign(c.id)}
                      />
                      <span className="flex-1 text-sm">{c.name}</span>
                      {c.active ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Ativa</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">{c.status || 'Inativa'}</Badge>
                      )}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveCampaigns} disabled={savingCampaigns}>
                    <Save className="h-4 w-4 mr-1" /> {savingCampaigns ? 'Salvando...' : 'Salvar seleção'}
                  </Button>
                  {monitoredCampaigns.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setMonitoredCampaigns([])}>
                      Limpar seleção
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Scan retroativo de alunos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-400" />
              Detecção de Alunos
            </CardTitle>
            <CardDescription>Verifica nos atendimentos do OpaSuite se leads existentes possuem tag de aluno.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              disabled={scanningAlunos}
              onClick={async () => {
                setScanningAlunos(true)
                setScanResult(null)
                try {
                  const res = await fetch('/api/leads/scan-alunos', { method: 'POST' })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error ?? 'Erro')
                  setScanResult(data)
                  toast.success(`Scan concluído: ${data.marked} lead(s) marcado(s) como aluno`)
                } catch (e: any) {
                  toast.error(e.message ?? 'Erro ao escanear')
                } finally {
                  setScanningAlunos(false)
                }
              }}
            >
              {scanningAlunos ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Escaneando...</>
              ) : (
                <><GraduationCap className="h-4 w-4 mr-2" /> Escanear Alunos Retroativamente</>
              )}
            </Button>
            {scanResult && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Atendimentos verificados: <strong>{scanResult.totalAtendimentos}</strong></p>
                <p>Com tag de aluno: <strong>{scanResult.alunosEncontrados}</strong></p>
                <p>Leads marcados como aluno: <strong className="text-blue-400">{scanResult.marked}</strong></p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* DDDs autorizados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              DDDs Autorizados
            </CardTitle>
            <CardDescription>Leads com DDD fora desta lista serão automaticamente marcados como "DDD Indesejado".</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={dddText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDddText(e.target.value)}
              placeholder="11, 12, 13, 14, ..."
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {dddText.split(',').filter((s: string) => s.trim().length === 2).length} DDDs configurados
              </p>
              <Button variant="outline" size="sm" onClick={saveDdds} disabled={savingDdds}>
                <Save className="h-4 w-4 mr-1" /> {savingDdds ? 'Salvando...' : 'Salvar DDDs'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mapeamento de linhas de WhatsApp (Vira Técnico / SSRJ) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-5 w-5 text-teal-400" />
              Mapeamento de Linhas (WhatsApp)
            </CardTitle>
            <CardDescription>
              Marca automaticamente cada lead conforme a <strong>linha de WhatsApp</strong> pela qual ele entrou:
              a linha <strong>11 94577-7262</strong> vira <strong>Vira Técnico</strong> e a linha <strong>21 2042-2360</strong> vira <strong>SSRJ</strong>.
              Como a OpaSuite não expõe o número da linha (apenas um <strong>ID de canal</strong> interno), você precisa
              associar cada linha ao seu ID de canal uma única vez. Clique em <strong>Descobrir IDs de canal</strong>,
              mande uma mensagem de teste para cada linha e use o botão correspondente para vincular o ID à linha certa.
              A página <strong>viratecnico</strong> continua sendo detectada automaticamente pelo nome (slug).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-teal-400" /> Vira Técnico — IDs de canal (linha 11 94577-7262)</Label>
              <textarea
                value={viraChannelsText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setViraChannelsText(e.target.value)}
                placeholder="ex.: 6aa8017f1b77cbefefcdfb13"
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Separe múltiplos IDs por vírgula.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> SSRJ — IDs de canal (linha 21 2042-2360)</Label>
              <textarea
                value={ssrjChannelsText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSsrjChannelsText(e.target.value)}
                placeholder="ex.: 6a105f6f90ecea1352adf322"
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Separe múltiplos IDs por vírgula. As etiquetas SSRJ_* também continuam valendo.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Vira Técnico — IDs de etiqueta (opcional)</Label>
              <textarea
                value={viraTagsText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setViraTagsText(e.target.value)}
                placeholder="IDs de etiquetas da OpaSuite (opcional)"
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Se você usar uma etiqueta específica para o Vira Técnico, cole o ID dela aqui.</p>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={fetchOpaChannels} disabled={loadingOpaChannels}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingOpaChannels ? 'animate-spin' : ''}`} /> Descobrir IDs de canal
              </Button>
              <Button variant="outline" size="sm" onClick={saveViraTecnico} disabled={savingVira}>
                <Save className="h-4 w-4 mr-1" /> {savingVira ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
            {opaChannels.length > 0 && (
              <div className="rounded-md border divide-y text-sm">
                {opaChannels.map((c) => (
                  <div key={c.channelId} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate flex items-center gap-2">
                        {c.channelId}
                        {c.channelType && (
                          <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{c.channelType}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.leads} leads · {c.webhookHits} chamadas recentes
                        {c.lastActivity ? ` · última atividade: ${new Date(c.lastActivity).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </p>
                      {c.recentCustomers && c.recentCustomers.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Clientes recentes</p>
                          {c.recentCustomers.map((rc, i) => (
                            <p key={i} className="font-mono text-[11px] text-muted-foreground">
                              {rc.phone} <span className="text-muted-foreground/60">· {new Date(rc.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-teal-500"
                        onClick={() => {
                          const cur = viraChannelsText.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
                          if (!cur.includes(c.channelId)) setViraChannelsText([...cur, c.channelId].join(', '))
                        }}
                      >
                        → Vira Técnico
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-500"
                        onClick={() => {
                          const cur = ssrjChannelsText.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
                          if (!cur.includes(c.channelId)) setSsrjChannelsText([...cur, c.channelId].join(', '))
                        }}
                      >
                        → SSRJ
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meta Conversions API */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              Meta Conversions API
            </CardTitle>
            <CardDescription>Teste a conexão com seu Pixel da Meta para garantir que os eventos serão enviados. O teste envia um evento real ao endpoint da Conversions API — informe um Test Event Code para direcioná-lo à aba "Testar eventos" sem afetar seus dados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="testEventCode">Test Event Code (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  id="testEventCode"
                  value={testEventCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTestEventCode(e.target.value)}
                  placeholder="Ex: TEST12345"
                  className="text-sm font-mono"
                />
                <Button variant="outline" size="sm" onClick={saveTestCode} disabled={savingTestCode}>
                  <Save className="h-4 w-4 mr-1" /> {savingTestCode ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Encontre em Events Manager → seu Pixel → aba <span className="font-medium">Testar eventos</span>.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={testMeta} disabled={testingMeta} variant="outline">
                {testingMeta ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              {metaStatus && (
                <Badge variant="outline" className={metaStatus.success ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-red-500/50 text-red-400 bg-red-500/10'}>
                  {metaStatus.success ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                  {metaStatus.message}
                </Badge>
              )}
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Funil de eventos (Lead → QualifiedLead → Purchase)</Label>
              <p className="text-xs text-muted-foreground">
                Novos leads e vendas de origem Meta já enviam o funil automaticamente. Use o botão abaixo para enviar
                retroativamente os últimos 60 dias (eventos deduplicados pela Meta via IDs determinísticos).
              </p>
              <Button onClick={backfillMeta} disabled={backfillingMeta} variant="outline">
                {backfillingMeta ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                {backfillingMeta ? 'Enviando histórico...' : 'Enviar histórico à Meta (60 dias)'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Google Ads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Google Ads
            </CardTitle>
            <CardDescription>
              Teste a conexão com a API do Google Ads (Explorer Access). O investimento do Google Ads é combinado com o da Meta para calcular ROAS e CAC no painel de Vendas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button
                onClick={async () => {
                  setTestingGoogle(true)
                  setGoogleStatus(null)
                  try {
                    const res = await fetch('/api/google-ads/test', { method: 'POST' })
                    const data = await res.json()
                    setGoogleStatus(data)
                  } catch {
                    setGoogleStatus({ success: false, message: 'Erro de conexão' })
                  } finally {
                    setTestingGoogle(false)
                  }
                }}
                disabled={testingGoogle}
                variant="outline"
              >
                {testingGoogle ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              {googleStatus && (
                <Badge variant="outline" className={googleStatus.success ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-red-500/50 text-red-400 bg-red-500/10'}>
                  {googleStatus.success ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                  {googleStatus.message}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Google Data Manager (Conversões Offline) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Google Data Manager (Conversões Offline)
            </CardTitle>
            <CardDescription>
              Envia matrículas confirmadas de volta ao Google Ads como conversões offline, permitindo otimizar campanhas com base em dados reais de venda. Usa a API Data Manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button
                onClick={async () => {
                  setTestingDM(true)
                  setDMStatus(null)
                  try {
                    const res = await fetch('/api/data-manager/test', { method: 'POST' })
                    const data = await res.json()
                    setDMStatus(data)
                  } catch {
                    setDMStatus({ success: false, message: 'Erro de conexão' })
                  } finally {
                    setTestingDM(false)
                  }
                }}
                disabled={testingDM}
                variant="outline"
              >
                {testingDM ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Wifi className="h-4 w-4 mr-2" />}
                Testar Conexão
              </Button>
              {dmStatus && (
                <Badge variant="outline" className={dmStatus.success ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-red-500/50 text-red-400 bg-red-500/10'}>
                  {dmStatus.success ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                  {dmStatus.message}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}