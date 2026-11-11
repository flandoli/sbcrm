'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api, useApi, NativeSelect, Empty, PAPEIS, PAPEL_LABEL, SEGMENTO_LABEL } from './ui'

interface U { id: string; name: string | null; email: string; papel: keyof typeof PAPEL_LABEL; segmento: string | null; ativo: boolean }
const blank = { name: '', email: '', papel: 'VENDEDOR', segmento: '', password: '', ativo: true }

export function UsersTab({ meId }: { meId: string }) {
  const { data, reload } = useApi<{ users: U[] }>('/api/admin/users')
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null)

  async function save() {
    if (!edit) return
    const { id, segmento, password, ...rest } = edit
    const body: Record<string, unknown> = { ...rest, segmento: segmento || null }
    if (password) body.password = password
    if (!id) delete body.ativo
    const ok = id ? await api(`/api/admin/users/${id}`, 'PATCH', body) : await api('/api/admin/users', 'POST', body)
    if (!ok) return
    toast.success(id ? 'Usuário atualizado' : 'Usuário criado')
    setEdit(null)
    reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ ...blank })}>
          <Plus className="mr-2 h-4 w-4" /> Novo usuário
        </Button>
      </div>
      {!data ? <Empty>Carregando…</Empty> : !data.users.length ? <Empty>Nenhum usuário.</Empty> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {data?.users.map((u) => (
          <Card key={u.id} className={u.ativo ? '' : 'opacity-60'}>
            <CardContent className="flex items-start justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name ?? '—'} {u.id === meId && <span className="text-xs text-muted-foreground">(você)</span>}</p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge>{PAPEL_LABEL[u.papel]}</Badge>
                  <Badge variant="outline">{SEGMENTO_LABEL[u.segmento ?? 'TODOS']}</Badge>
                  {!u.ativo && <Badge variant="destructive">Inativo</Badge>}
                </div>
              </div>
              <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEdit({ ...blank, ...u, name: u.name ?? '', segmento: u.segmento ?? '' })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Papel</Label>
                  <NativeSelect value={edit.papel} onChange={(e) => setEdit({ ...edit, papel: e.target.value })}>
                    {PAPEIS.map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label>Segmento</Label>
                  <NativeSelect value={edit.segmento} onChange={(e) => setEdit({ ...edit, segmento: e.target.value })}>
                    <option value="">Ambos</option>
                    <option value="VAREJO">Varejo</option>
                    <option value="INDUSTRIA">Indústria</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{edit.id ? 'Nova senha (deixe vazio para manter)' : 'Senha (mín. 10 caracteres)'}</Label>
                <Input type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
              </div>
              {edit.id && (
                <div className="flex items-center justify-between">
                  <Label>Ativo (inativo não consegue entrar)</Label>
                  <Switch checked={edit.ativo} onCheckedChange={(v) => setEdit({ ...edit, ativo: v })} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
