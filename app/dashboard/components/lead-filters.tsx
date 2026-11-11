'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Filter, X } from 'lucide-react'

interface Filters {
  status: string
  ddd: string
  dateFrom: string
  dateTo: string
  source: string
  channel: string
  vaicrmStage: string
  vaicrmSaleStatus: string
}

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'NOVO', label: '🟡 Novo' },
  { value: 'QUALIFICADO', label: '✅ Qualificado' },
  { value: 'SEM_INTERESSE', label: '😐 Sem Interesse' },
  { value: 'DDD_INDESEJADO', label: '📍 DDD Indesejado' },
  { value: 'DDI_INDESEJADO', label: '🌍 DDI Indesejado' },
  { value: 'INVALIDO', label: '🚫 Inválido' },
  { value: 'ALUNO', label: '🎓 Aluno' },
]

const sourceOptions = [
  { value: '', label: 'Todas as fontes' },
  { value: 'opasuite', label: '💬 OpaSuite' },
  { value: 'leadster', label: '🤖 Leadster' },
  { value: 'vaivendas', label: '📞 VCRM' },
]

const stageOptions = [
  { value: '', label: 'Todas as etapas' },
  { value: 'Apresentação', label: '🗂️ Apresentação' },
  { value: 'Analisando', label: '🔎 Analisando' },
  { value: 'Negociação', label: '🤝 Negociação' },
  { value: 'Matrícula', label: '🎓 Matrícula' },
  { value: 'Perda', label: '❌ Perda' },
]

const saleStatusOptions = [
  { value: '', label: 'Todas as situações' },
  { value: 'Matrícula', label: '🎓 Matrícula (fechamento)' },
  { value: 'Pós-matrícula', label: '📘 Pós-matrícula' },
  { value: 'Lead Quente', label: '🔥 Lead Quente' },
  { value: 'Curso Técnico', label: '🔧 Curso Técnico' },
]

const channelOptions = [
  { value: '', label: 'Todos os canais' },
  { value: 'pago_meta', label: '📘 Meta Ads' },
  { value: 'pago_google', label: '🔍 Google Ads' },
  { value: 'pago_outro', label: '💰 Mídia Paga' },
  { value: 'organico', label: '🌱 Orgânico' },
  { value: 'direto', label: '🔗 Direto' },
  { value: 'http', label: '🌐 Site' },
  { value: 'meta_sem_etiqueta', label: '⚠️ Meta sem etiqueta' },
  { value: 'ssrj', label: '🟣 SSRJ (outra conta)' },
  { value: 'viratecnico', label: '🔧 Vira Técnico' },
]

export function LeadFilters({ filters, onFilterChange }: { filters: Filters; onFilterChange: (f: Filters) => void }) {
  const hasFilters = filters.status || filters.ddd || filters.dateFrom || filters.dateTo || filters.source || filters.channel || filters.vaicrmStage || filters.vaicrmSaleStatus

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filtros:</span>
      </div>

      <div className="w-44">
        <Select
          value={filters.status}
          onValueChange={(v: string) => onFilterChange({ ...filters, status: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {statusOptions.filter((s: any) => s.value).map((s: any) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Select
          value={filters.source || 'all_sources'}
          onValueChange={(v: string) => onFilterChange({ ...filters, source: v === 'all_sources' ? '' : v })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Fonte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_sources">Todas as fontes</SelectItem>
            {sourceOptions.filter((s: any) => s.value).map((s: any) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-44">
        <Select
          value={filters.channel || 'all_channels'}
          onValueChange={(v: string) => onFilterChange({ ...filters, channel: v === 'all_channels' ? '' : v })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_channels">Todos os canais</SelectItem>
            {channelOptions.filter((c: any) => c.value).map((c: any) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-44">
        <Select
          value={filters.vaicrmStage || 'all_stages'}
          onValueChange={(v: string) => onFilterChange({ ...filters, vaicrmStage: v === 'all_stages' ? '' : v })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Etapa (VCRM)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_stages">Todas as etapas</SelectItem>
            {stageOptions.filter((s: any) => s.value).map((s: any) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-52">
        <Select
          value={filters.vaicrmSaleStatus || 'all_sale'}
          onValueChange={(v: string) => onFilterChange({ ...filters, vaicrmSaleStatus: v === 'all_sale' ? '' : v })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Situação de venda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_sale">Todas as situações</SelectItem>
            {saleStatusOptions.filter((s: any) => s.value).map((s: any) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Input
        placeholder="DDD (ex: 11)"
        className="w-28 h-9 text-sm"
        value={filters.ddd}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFilterChange({ ...filters, ddd: e.target.value })}
        maxLength={2}
      />

      <Input
        type="date"
        className="w-36 h-9 text-sm"
        value={filters.dateFrom}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFilterChange({ ...filters, dateFrom: e.target.value })}
      />

      <span className="text-muted-foreground text-sm">até</span>

      <Input
        type="date"
        className="w-36 h-9 text-sm"
        value={filters.dateTo}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFilterChange({ ...filters, dateTo: e.target.value })}
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onFilterChange({ status: '', ddd: '', dateFrom: '', dateTo: '', source: '', channel: '', vaicrmStage: '', vaicrmSaleStatus: '' })}>
          <X className="h-4 w-4 mr-1" /> Limpar
        </Button>
      )}
    </div>
  )
}
