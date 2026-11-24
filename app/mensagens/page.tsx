import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { MessagesClient } from './messages-client'

export const dynamic = 'force-dynamic'

export default async function MensagensPage() {
  if (!(await getSessionUser())) redirect('/login')
  return <MessagesClient />
}
