'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, CheckCircle2, MinusCircle, MapPin, Globe, Ban, CalendarDays, Megaphone, GraduationCap, AlertTriangle, Tag, Wrench, Phone } from 'lucide-react'

interface Stats {
  total: number
  qualificados: number
  semInteresse: number
  dddIndesejado: number
  ddiIndesejado: number
  invalidos: number
  novos: number
  totalAll: number
  fromAds: number
  alunos: number
  metaSemEtiqueta?: number
  ssrjTotal?: number
  viraTecnicoTotal?: number
  fromVaicrm?: number
}

const cards = [
  { key: 'total', label: 'Total', icon: CalendarDays, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { key: 'novos', label: 'Novos', icon: Users, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { key: 'qualificados', label: 'Qualificados', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  { key: 'semInteresse', label: 'Sem Interesse', icon: MinusCircle, color: 'text-gray-400', bg: 'bg-gray-400/10' },
  { key: 'alunos', label: 'Alunos', icon: GraduationCap, color: 'text-sky-400', bg: 'bg-sky-400/10' },
  { key: 'fromAds', label: 'De Anúncios', icon: Megaphone, color: 'text-violet-400', bg: 'bg-violet-400/10' },
  { key: 'metaSemEtiqueta', label: 'Meta s/ etiqueta', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { key: 'ssrjTotal', label: 'SSRJ (outra conta)', icon: Tag, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { key: 'viraTecnicoTotal', label: 'Vira Técnico', icon: Wrench, color: 'text-teal-400', bg: 'bg-teal-400/10' },
  { key: 'fromVaicrm', label: 'Leads VCRM', icon: Phone, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'dddIndesejado', label: 'DDD Indesejado', icon: MapPin, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  { key: 'ddiIndesejado', label: 'DDI Indesejado', icon: Globe, color: 'text-red-400', bg: 'bg-red-400/10' },
  { key: 'invalidos', label: 'Inválidos', icon: Ban, color: 'text-red-600', bg: 'bg-red-600/10' },
] as const

export function StatsCards({ stats, loading, periodLabel }: { stats: Stats | null; loading: boolean; periodLabel?: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map((c) => {
        const Icon = c.icon
        const value = stats ? (stats as any)[c.key] ?? 0 : 0
        const sublabel = c.key === 'total' && periodLabel ? `Total • ${periodLabel}` : c.label
        return (
          <Card key={c.key} className="overflow-hidden">
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${c.bg}`}>
                    <Icon className={`h-6 w-6 ${c.color}`} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold font-mono tracking-tight">{value}</p>
                    <p className="text-sm font-medium text-muted-foreground">{sublabel}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
