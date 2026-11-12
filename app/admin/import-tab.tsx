'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Resultado {
  simulado: boolean
  contas: { criadas: number; atualizadas: number; cnpjProvisorio: number }
  contatos: { criados: number; atualizados: number }
  oportunidades: { criadas: number; atualizadas: number }
  notas: { criadas: number; atualizadas: number }
  produtos: { criados: number; atualizados: number }
  categorias: { criadas: number; atualizadas: number }
  usuariosCriados: string[]
  origensCriadas: string[]
  avisos: string[]
}

export function ImportTab() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)

  async function enviar(simular: boolean) {
    if (!arquivo) return
    setEnviando(true)
    const fd = new FormData()
    fd.append('arquivo', arquivo)
    if (simular) fd.append('simular', '1')
    const r = await fetch('/api/admin/import', { method: 'POST', body: fd })
    const data = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) return toast.error(data?.error ?? `Erro ${r.status}`)
    setRes(data)
    toast.success(simular ? 'Simulação concluída: nada foi gravado' : 'Importação concluída')
  }

  const linhas: [string, string][] = res
    ? [
        ['Contas', `${res.contas.criadas} novas, ${res.contas.atualizadas} atualizadas (${res.contas.cnpjProvisorio} com CNPJ provisório)`],
        ['Contatos', `${res.contatos.criados} novos, ${res.contatos.atualizados} atualizados`],
        ['Oportunidades', `${res.oportunidades.criadas} novas, ${res.oportunidades.atualizadas} já existentes`],
        ['Notas', `${res.notas.criadas} novas, ${res.notas.atualizadas} atualizadas`],
        ['Produtos', `${res.produtos.criados} novos, ${res.produtos.atualizados} atualizados`],
        ['Categorias', `${res.categorias.criadas} novas, ${res.categorias.atualizadas} atualizadas`],
      ]
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importação por planilha</CardTitle>
        <CardDescription>
          Use o arquivo padrão (.xlsx com as abas Empresas, Contatos, Oportunidades, Notas, Produtos e Categorias). Reimportar o mesmo
          arquivo atualiza os registros pela coluna &quot;Chave&quot;, sem duplicar. Empresas sem CNPJ recebem um CNPJ provisório que
          precisa ser trocado em Contas. Simule antes de importar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="file" accept=".xlsx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <Button variant="outline" disabled={!arquivo || enviando} onClick={() => enviar(true)}>Simular</Button>
          <Button disabled={!arquivo || enviando} onClick={() => enviar(false)}>
            <Upload className="mr-2 h-4 w-4" /> {enviando ? 'Processando…' : 'Importar'}
          </Button>
        </div>
        {res && (
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <p className="font-medium">{res.simulado ? 'Simulação (nada gravado)' : 'Importação gravada'}</p>
            <dl className="grid gap-1 sm:grid-cols-[10rem_1fr]">
              {linhas.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {!!res.usuariosCriados.length && <p>Vendedores criados inativos (ativar em Usuários): {res.usuariosCriados.join(', ')}</p>}
            {!!res.origensCriadas.length && <p>Origens criadas: {res.origensCriadas.join(', ')}</p>}
            {!!res.avisos.length && (
              <details>
                <summary className="cursor-pointer">{res.avisos.length} aviso(s)</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {res.avisos.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
