'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { FcShell } from '@/components/fc-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function SettingsClient() {
  const { data } = useSession()
  const isAdmin = data?.user?.papel === 'ADMIN'
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [ddds, setDdds] = useState('')
  const [ddis, setDdis] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        setSettings(s)
        try {
          setDdds((JSON.parse(s.allowed_ddds ?? '[]') as string[]).join(', '))
          setDdis((JSON.parse(s.allowed_ddis ?? '[]') as string[]).join(', '))
        } catch {}
      })
  }, [])

  async function save(key: string, value: string) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(body?.error ?? 'Erro ao salvar')
    setSettings((s) => ({ ...s, [key]: value }))
    const r = body?.reclassificacao as { analisados: number; alterados: number } | undefined
    toast.success(
      'Configuração salva',
      r ? { description: `Regra reaplicada aos leads existentes: ${r.alterados} de ${r.analisados} mudaram de status (alterações manuais preservadas).` } : undefined,
    )
  }

  const toList = (raw: string) => JSON.stringify(Array.from(new Set(raw.split(/[\s,;+]+/).map((d) => d.trim()).filter(Boolean))).sort())

  return (
    <FcShell title="Configurações">
      <div className="mx-auto max-w-2xl space-y-4">
        {!isAdmin && <p className="text-sm text-muted-foreground">Somente o Admin altera configurações.</p>}

        <Card>
          <CardHeader>
            <CardTitle>Qualificação — modo pré (DDD/DDI)</CardTitle>
            <CardDescription>DDDs aceitos. Leads fora da lista entram como DDD indesejado. Vazio = padrão (11 a 49).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="ddds">DDDs permitidos</Label>
            <Input id="ddds" value={ddds} disabled={!isAdmin} onChange={(e) => setDdds(e.target.value)} placeholder="11, 21, 41" />
            <Button onClick={() => save('allowed_ddds', toList(ddds))} disabled={!isAdmin}>
              Salvar DDDs
            </Button>
            <Label htmlFor="ddis" className="block pt-2">DDIs internacionais aceitos (além do 55)</Label>
            <Input id="ddis" value={ddis} disabled={!isAdmin} onChange={(e) => setDdis(e.target.value)} placeholder="1, 351, 54" />
            <Button onClick={() => save('allowed_ddis', toList(ddis))} disabled={!isAdmin}>
              Salvar DDIs
            </Button>
            <p className="text-xs text-muted-foreground">
              Ao salvar, a regra é reaplicada aos leads já gravados. Status definidos manualmente não são alterados.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qualificação automática e modo posterior</CardTitle>
            <CardDescription>O envio de eventos de qualificação para a Meta (CAPI) fica desligado na v1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="auto">Qualificar automaticamente leads com DDD válido</Label>
              <Switch
                id="auto"
                disabled={!isAdmin}
                checked={settings.auto_qualify !== 'false'}
                onCheckedChange={(v) => save('auto_qualify', String(v))}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="capi">Enviar eventos CAPI (Meta)</Label>
              <Switch
                id="capi"
                disabled={!isAdmin}
                checked={settings.capi_enabled === 'true'}
                onCheckedChange={(v) => save('capi_enabled', String(v))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </FcShell>
  )
}
