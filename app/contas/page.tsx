import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { ContasClient } from './contas-client'

export const dynamic = 'force-dynamic'

export default async function ContasPage() {
  if (!(await getSessionUser())) redirect('/login')
  return <ContasClient />
}
