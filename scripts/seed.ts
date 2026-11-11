import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEFAULT_DDDS = [
  '11','12','13','14','15','16','17','18','19',
  '20','21','22','23','24','25','26','27','28','29',
  '30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49',
]

async function main() {
  // Seed test admin account
  const hashedPassword = await bcrypt.hash('QT*NZhwWh5', 12)
  await prisma.user.upsert({
    where: { email: 'abacus-2c03844b@example.com' },
    update: { password: hashedPassword, name: 'Admin' },
    create: {
      email: 'abacus-2c03844b@example.com',
      password: hashedPassword,
      name: 'Admin',
    },
  })

  // Seed default allowed DDDs
  await prisma.setting.upsert({
    where: { key: 'allowed_ddds' },
    update: {},
    create: {
      key: 'allowed_ddds',
      value: JSON.stringify(DEFAULT_DDDS),
    },
  })

  console.log('Seed completed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
