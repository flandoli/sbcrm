import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

export const dynamic = 'force-dynamic'

// Ponto de entrada da aplicação (/app).
// Envia o usuário para o painel se autenticado, ou para o login caso contrário.
export default async function AppEntry() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')
  redirect('/login')
}
