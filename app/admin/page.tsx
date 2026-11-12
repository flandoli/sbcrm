import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { AdminClient } from './admin-client'

export const dynamic = 'force-dynamic'

// Admin vê tudo; Diretor vê alçadas, índices e histórico. Demais papéis voltam ao painel.
export default async function AdminPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.papel !== 'ADMIN' && user.papel !== 'DIRETOR') redirect('/dashboard')
  return <AdminClient papel={user.papel} meId={user.id} />
}
