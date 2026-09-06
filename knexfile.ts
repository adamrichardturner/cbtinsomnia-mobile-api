import type { Knex } from 'knex'

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL is required for Knex')
  }
  return url
}

const shared: Knex.Config = {
  client: 'pg',
  connection: databaseUrl(),
  pool: {
    min: 1,
    max: 10,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
}

const config: Record<string, Knex.Config> = {
  development: shared,
  test: shared,
  production: shared,
}

export default config
