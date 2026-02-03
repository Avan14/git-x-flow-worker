import 'dotenv/config'
import { prisma } from './lib/db.js'
import { logger } from './lib/logger.js'

async function checkDb() {
  logger.info('Checking database connection...')

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set')
    process.exit(1)
  }

  try {
    await prisma.$queryRaw`SELECT 1`

    console.log('\n✅ PostgreSQL connection established')

    const [userCount, postCount, connectionCount] = await Promise.all([
      prisma.user.count(),
      prisma.scheduledPost.count(),
      prisma.socialConnection.count(),
    ])

    console.log('\n--- DATABASE STATUS ---')
    console.log(`Users: ${userCount}`)
    console.log(`Scheduled Posts: ${postCount}`)
    console.log(`Social Connections: ${connectionCount}`)
    console.log('----------------------\n')
  } catch (err: any) {
    logger.error({ err }, '❌ Database check failed')
    console.error('\n❌ Could not connect to PostgreSQL\n')
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkDb()
