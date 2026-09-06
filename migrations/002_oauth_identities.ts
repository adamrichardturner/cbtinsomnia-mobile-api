import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.text('password_hash').nullable().alter()
    table.timestamp('email_verified_at', { useTz: true }).nullable()
  })

  await knex.schema.createTable('auth_identities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.text('provider').notNullable()
    table.text('provider_subject').notNullable()
    table.specificType('email', 'citext')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.unique(['provider', 'provider_subject'])
    table.index(['user_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_identities')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('email_verified_at')
    table.text('password_hash').notNullable().alter()
  })
}
