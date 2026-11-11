import { DefaultSession, DefaultUser } from 'next-auth'
import type { Papel } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      papel: Papel
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    id: string
    papel: Papel
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    papel: Papel
  }
}
