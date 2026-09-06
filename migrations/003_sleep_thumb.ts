import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sleep_nights', (table) => {
    table.text('sleep_thumb').nullable()
  })
  await knex.raw(`
    ALTER TABLE sleep_nights
    ADD CONSTRAINT sleep_nights_sleep_thumb_check
    CHECK (sleep_thumb IS NULL OR sleep_thumb IN ('up', 'down'))
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE sleep_nights
    DROP CONSTRAINT IF EXISTS sleep_nights_sleep_thumb_check
  `)
  await knex.schema.alterTable('sleep_nights', (table) => {
    table.dropColumn('sleep_thumb')
  })
}
