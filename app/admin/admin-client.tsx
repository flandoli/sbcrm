'use client'

import { FcShell } from '@/components/fc-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsersTab } from './users-tab'
import { FunnelTab } from './funnel-tab'
import { OriginsTab } from './origins-tab'
import { CatalogTab } from './catalog-tab'
import { DiscountTab, ConversionTab } from './rates-tabs'
import { AuditTab } from './audit-tab'

export function AdminClient({ papel, meId }: { papel: 'ADMIN' | 'DIRETOR'; meId: string }) {
  const isAdmin = papel === 'ADMIN'
  const tabs = [
    ...(isAdmin
      ? [
          { id: 'usuarios', label: 'Usuários', el: <UsersTab meId={meId} /> },
          { id: 'funil', label: 'Funil', el: <FunnelTab /> },
          { id: 'origens', label: 'Origens e parceiros', el: <OriginsTab /> },
          { id: 'catalogos', label: 'Catálogos', el: <CatalogTab /> },
        ]
      : []),
    { id: 'alcadas', label: 'Alçadas de desconto', el: <DiscountTab canEdit /> },
    { id: 'indices', label: 'Índices de conversão', el: <ConversionTab canEdit /> },
    { id: 'historico', label: 'Histórico', el: <AuditTab /> },
  ]
  return (
    <FcShell title="Admin">
      <Tabs defaultValue={tabs[0].id} className="mx-auto max-w-5xl">
        <div className="-mx-1 overflow-x-auto pb-1">
          <TabsList className="w-max">
            {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          </TabsList>
        </div>
        {tabs.map((t) => <TabsContent key={t.id} value={t.id} className="mt-4">{t.el}</TabsContent>)}
      </Tabs>
    </FcShell>
  )
}
