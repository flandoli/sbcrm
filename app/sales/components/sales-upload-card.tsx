'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertTriangle, Send } from 'lucide-react'
import { toast } from 'sonner'

interface OfflineConvResult {
  total: number
  sent: number
  errors: number
  skippedHttp: number
  skippedAlreadySent: number
  skippedNoIdentifier: number
  withGclid: number
  withPhoneOnly: number
  details?: Array<{ saleId: string; matricula: string; success: boolean; error?: string }>
}

interface UploadResult {
  total: number
  imported: number
  matched: number
  unmatched: number
  skipped: number
  phoneCorrupted?: number
  warnings?: string[]
  errorCount: number
  errors: string[]
  offlineConversions?: OfflineConvResult | null
}

export function SalesUploadCard({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) {
      toast.error('Selecione um arquivo CSV ou XLSX primeiro.')
      return
    }
    setUploading(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/sales/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Erro ao importar planilha')
        return
      }
      setResult(data)
      toast.success(
        `Importação concluída: ${data.imported} matrícula(s), ${data.matched} casada(s) com leads.`,
      )
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onImported()
    } catch {
      toast.error('Erro de conexão ao enviar a planilha.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
          Importar planilha de matrículas
        </CardTitle>
        <CardDescription>
          Atualize sua planilha do Google Sheets, exporte como CSV ou XLSX e envie aqui. As
          matrículas são cruzadas com os leads pelo telefone. Reenviar a mesma planilha atualiza os
          registros (sem duplicar).
          <span className="mt-2 block text-amber-500">
            Importante: formate a coluna de telefone como <strong>Texto simples</strong> antes de
            exportar. Se ela ficar como número, os telefones viram notação científica (ex.:
            &quot;5.51195E+12&quot;) e não casam com os leads.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setResult(null)
            }}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer"
          />
          <Button onClick={handleUpload} disabled={uploading || !file} className="shrink-0">
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {uploading ? 'Importando...' : 'Importar'}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Resumo da importação
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-2xl font-bold font-mono">{result.imported}</p>
                <p className="text-muted-foreground">Importadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-emerald-500">{result.matched}</p>
                <p className="text-muted-foreground">Casadas c/ leads</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-amber-500">{result.unmatched}</p>
                <p className="text-muted-foreground">Sem lead</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-muted-foreground">{result.skipped}</p>
                <p className="text-muted-foreground">Ignoradas</p>
              </div>
            </div>
            {result.warnings && result.warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
            {result.errorCount > 0 && (
              <div className="mt-3 text-sm text-red-500">
                <p className="font-medium">{result.errorCount} erro(s):</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i} className="truncate">{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.offlineConversions && (
              <div className="mt-3 rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm">
                <div className="flex items-center gap-2 mb-1 font-medium text-blue-600 dark:text-blue-400">
                  <Send className="h-4 w-4" />
                  Conversões offline → Google Ads
                </div>
                <p className="text-muted-foreground">
                  {result.offlineConversions.sent} enviada(s)
                  {result.offlineConversions.withGclid > 0 && (
                    <span className="text-emerald-500"> ({result.offlineConversions.withGclid} c/ gclid)</span>
                  )}
                  {result.offlineConversions.withPhoneOnly > 0 && (
                    <span className="text-blue-400"> ({result.offlineConversions.withPhoneOnly} c/ tel/email)</span>
                  )}
                  {result.offlineConversions.errors > 0 && (
                    <span className="text-red-500"> · {result.offlineConversions.errors} erro(s)</span>
                  )}
                  {(result.offlineConversions.skippedAlreadySent + result.offlineConversions.skippedHttp + result.offlineConversions.skippedNoIdentifier) > 0 && (
                    <span> · {result.offlineConversions.skippedAlreadySent + result.offlineConversions.skippedHttp + result.offlineConversions.skippedNoIdentifier} ignorada(s)</span>
                  )}
                </p>
                {result.offlineConversions.details && result.offlineConversions.details.filter(d => !d.success).length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-xs text-red-400">
                    {result.offlineConversions.details.filter(d => !d.success).slice(0, 5).map((d, i) => (
                      <li key={i} className="truncate">Matrícula {d.matricula}: {d.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
