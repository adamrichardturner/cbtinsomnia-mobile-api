import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const client = new Client({ connectionString: databaseUrl })
try {
  await client.connect()
  await client.query('select 1 as ok')
  await client.end()
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
