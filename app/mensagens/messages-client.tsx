'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImageIcon, Megaphone, Paperclip, Plus, Send, X } from 'lucide-react'
import { FcShell, MESSAGES_READ_EVENT } from '@/components/fc-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api, Empty, PAPEL_LABEL } from '../admin/ui'

const BROADCAST_ID = 'todos'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

interface UserLite {
  id: string
  name: string | null
  email: string
  papel: keyof typeof PAPEL_LABEL | null
}

interface Conversation {
  partner: UserLite
  lastMessage: { body: string; hasImage: boolean; mine: boolean; createdAt: string; fromName?: string }
  unread: number
}

interface Message {
  id: string
  fromId: string
  toId: string | null
  body: string
  imageData: string | null
  imageMime: string | null
  readAt: string | null
  createdAt: string
  mine: boolean
  from: UserLite
}

const nomeDe = (u?: { name?: string | null; email?: string } | null) => u?.name || u?.email || '—'

function quando(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Avatar({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {id === BROADCAST_ID ? <Megaphone className="h-4 w-4" /> : label.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function MessagesClient() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [users, setUsers] = useState<UserLite[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [partner, setPartner] = useState<{ id: string; name: string | null; email?: string } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConv, setLoadingConv] = useState(false)
  const [novaOpen, setNovaOpen] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState<{ data: string; mime: string; name: string } | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId

  const loadConversations = useCallback(async () => {
    const d = await api<{ conversations: Conversation[]; users: UserLite[] }>('/api/messages')
    if (d) {
      setConversations(d.conversations)
      setUsers(d.users)
    }
  }, [])

  const loadMessages = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setLoadingConv(true)
      const d = await api<{ partner: { id: string; name: string | null; email?: string }; messages: Message[] }>(
        `/api/messages?userId=${encodeURIComponent(id)}`,
      )
      if (!silent) setLoadingConv(false)
      if (!d || activeRef.current !== id) return
      setPartner(d.partner)
      setMessages((prev) => (silent && prev.length === d.messages.length && prev.at(-1)?.id === d.messages.at(-1)?.id ? prev : d.messages))

      // Marca como lidas as recebidas ainda não lidas
      const unread = d.messages.filter((m) => !m.mine && !m.readAt)
      if (unread.length) {
        await Promise.all(unread.map((m) => fetch(`/api/messages/${m.id}/read`, { method: 'PATCH' })))
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT))
        loadConversations()
      }
    },
    [loadConversations],
  )

  // Carga inicial (+ ?userId= na URL abre a conversa) e atualização periódica
  useEffect(() => {
    loadConversations()
    const fromUrl = new URLSearchParams(window.location.search).get('userId')
    if (fromUrl) setActiveId(fromUrl)
    const t = setInterval(() => {
      loadConversations()
      if (activeRef.current) loadMessages(activeRef.current, true)
    }, 15000)
    return () => clearInterval(t)
  }, [loadConversations, loadMessages])

  useEffect(() => {
    if (!activeId) return
    setMessages([])
    setPartner(null)
    loadMessages(activeId)
    const url = new URL(window.location.href)
    url.searchParams.set('userId', activeId)
    window.history.replaceState(null, '', url)
  }, [activeId, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  function pickImage(file?: File) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!IMAGE_MIMES.includes(file.type)) return toast.error('Use uma imagem JPEG, PNG, GIF ou WebP')
    if (file.size > MAX_IMAGE_BYTES) return toast.error('A imagem deve ter no máximo 2 MB')
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const data = result.slice(result.indexOf(',') + 1)
      setImage({ data, mime: file.type, name: file.name })
    }
    reader.onerror = () => toast.error('Não foi possível ler a imagem')
    reader.readAsDataURL(file)
  }

  async function send() {
    if (!activeId || sending) return
    const body = text.trim()
    if (!body && !image) return
    setSending(true)
    const msg = await api<Message>('/api/messages', 'POST', {
      toId: activeId === BROADCAST_ID ? null : activeId,
      body,
      imageData: image?.data,
      imageMime: image?.mime,
    })
    setSending(false)
    if (!msg) return
    setText('')
    setImage(null)
    setMessages((prev) => [...prev, msg])
    loadConversations()
  }

  const activeName =
    activeId === BROADCAST_ID
      ? 'Todos'
      : nomeDe(partner ?? users.find((u) => u.id === activeId) ?? conversations?.find((c) => c.partner.id === activeId)?.partner)

  return (
    <FcShell title="Mensagens">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Converse com a equipe ou envie um aviso para todos.</p>
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nova mensagem
        </Button>
      </div>

      <div className="grid h-[calc(100vh-11rem)] min-h-[420px] gap-4 md:grid-cols-[300px_1fr]">
        {/* Conversas */}
        <Card className={cn('flex flex-col overflow-hidden', activeId && 'hidden md:flex')}>
          <div className="border-b px-4 py-3 text-sm font-medium">Conversas</div>
          <div className="flex-1 overflow-y-auto">
            {conversations === null ? (
              <Empty>Carregando…</Empty>
            ) : conversations.length === 0 ? (
              <Empty>Nenhuma conversa ainda. Clique em “Nova mensagem”.</Empty>
            ) : (
              conversations.map((c) => {
                const label = c.partner.id === BROADCAST_ID ? 'Todos' : nomeDe(c.partner)
                const prefix = c.lastMessage.mine ? 'Você: ' : c.lastMessage.fromName ? `${c.lastMessage.fromName}: ` : ''
                const preview = c.lastMessage.body || (c.lastMessage.hasImage ? '📷 Imagem' : '')
                return (
                  <button
                    key={c.partner.id}
                    onClick={() => setActiveId(c.partner.id)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent',
                      activeId === c.partner.id && 'bg-accent',
                    )}
                  >
                    <Avatar id={c.partner.id} label={label} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-sm', c.unread > 0 && 'font-semibold')}>{label}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{quando(c.lastMessage.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {prefix}
                          {preview}
                        </span>
                        {c.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </Card>

        {/* Conversa ativa */}
        <Card className={cn('flex flex-col overflow-hidden', !activeId && 'hidden md:flex')}>
          {!activeId ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <Empty>Selecione uma conversa ou comece uma nova mensagem.</Empty>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId(null)} aria-label="Voltar">
                  <X className="h-4 w-4" />
                </Button>
                <Avatar id={activeId} label={activeName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{activeName}</p>
                  {activeId === BROADCAST_ID && <p className="text-xs text-muted-foreground">Aviso para todos os usuários</p>}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {loadingConv && messages.length === 0 ? (
                  <Empty>Carregando…</Empty>
                ) : messages.length === 0 ? (
                  <Empty>Nenhuma mensagem nesta conversa.</Empty>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm',
                          m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                        )}
                      >
                        {activeId === BROADCAST_ID && !m.mine && (
                          <p className="mb-1 text-xs font-semibold opacity-80">{nomeDe(m.from)}</p>
                        )}
                        {m.imageData && m.imageMime && (
                          <a href={`data:${m.imageMime};base64,${m.imageData}`} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`data:${m.imageMime};base64,${m.imageData}`}
                              alt="Imagem enviada"
                              className="mb-1 max-h-72 rounded-md object-contain"
                            />
                          </a>
                        )}
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        <p className={cn('mt-1 text-right text-[10px]', m.mine ? 'opacity-70' : 'text-muted-foreground')}>
                          {quando(m.createdAt)}
                          {m.mine && m.toId && (m.readAt ? ' · lida' : ' · enviada')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <form
                className="space-y-2 border-t p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                {image && (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`data:${image.mime};base64,${image.data}`} alt={image.name} className="max-h-32 rounded-md border" />
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      className="absolute -right-2 -top-2 rounded-full bg-background p-0.5 shadow"
                      aria-label="Remover imagem"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickImage(e.target.files?.[0])}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} aria-label="Anexar imagem">
                    {image ? <ImageIcon className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    placeholder={activeId === BROADCAST_ID ? 'Aviso para todos…' : 'Escreva uma mensagem…'}
                    rows={2}
                    maxLength={5000}
                    className="min-h-[44px] flex-1 resize-none"
                  />
                  <Button type="submit" disabled={sending || (!text.trim() && !image)}>
                    <Send className="mr-1 h-4 w-4" /> Enviar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Enter envia · Shift+Enter quebra linha · imagem até 2 MB</p>
              </form>
            </>
          )}
        </Card>
      </div>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova mensagem</DialogTitle>
            <DialogDescription>Escolha o destinatário.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
              onClick={() => {
                setActiveId(BROADCAST_ID)
                setNovaOpen(false)
              }}
            >
              <Avatar id={BROADCAST_ID} label="Todos" />
              <div>
                <p className="text-sm font-medium">Todos</p>
                <p className="text-xs text-muted-foreground">Aviso para todos os usuários</p>
              </div>
            </button>
            {users.map((u) => (
              <button
                key={u.id}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  setActiveId(u.id)
                  setNovaOpen(false)
                }}
              >
                <Avatar id={u.id} label={nomeDe(u)} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{nomeDe(u)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.papel ? PAPEL_LABEL[u.papel] : ''} · {u.email}
                  </p>
                </div>
              </button>
            ))}
            {users.length === 0 && <Empty>Nenhum outro usuário ativo.</Empty>}
          </div>
        </DialogContent>
      </Dialog>
    </FcShell>
  )
}
