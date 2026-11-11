'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, Tags, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ClassResult {
  totalPlanilha: number
  atualizadas: number
  naoEncontradas: number
  message: string
}

export function ClassificationUploadCard({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ClassResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) {
      toast.error('Selecione o arquivo XLSX de classificação.')
      return
    }
    setUploading(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/sales/upload-classification', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Erro ao processar planilha')
        return
      }
      setResult(data)
      toast.success(data.message)
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
          <Tags className="h-5 w-5 text-violet-500" />
          Classificação de mídia (Grupo Macro)
        </CardTitle>
        <CardDescription>
          Envie a planilha com as colunas <strong>Matricula</strong>,{' '}
          <strong>MIDIA AJUSTADA</strong> e <strong>GRUPO MACRO</strong> para atualizar a
          classificação de atribuição das vendas. Reenvie diariamente para manter atualizado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            {uploading ? 'Processando...' : 'Enviar classificação'}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Resultado
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-2xl font-bold font-mono">{result.totalPlanilha}</p>
                <p className="text-muted-foreground">Na planilha</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-emerald-500">{result.atualizadas}</p>
                <p className="text-muted-foreground">Atualizadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-amber-500">{result.naoEncontradas}</p>
                <p className="text-muted-foreground">Não encontradas</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
