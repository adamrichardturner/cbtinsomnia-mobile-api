import knex, { type Knex } from 'knex'
import type { Env } from '../../config/env.js'

export function createDb(env: Env): Knex {
  return knex({
    client: 'pg',
    connection: env.DATABASE_URL,
    pool: { min: 1, max: 10 },
  })
}
