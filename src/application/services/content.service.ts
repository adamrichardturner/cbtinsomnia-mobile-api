import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { ADVICE_ARTICLES } from '../../domain/advice/articles.js'
import { SEED_DEFINITIONS, toFieldSchema } from '../../domain/worksheets/seed-definitions.js'
import { notFound } from '../../shared/errors.js'

export class ContentService {
  constructor(private readonly db: Knex) {}

  listAdvice() {
    return ADVICE_ARTICLES.map((article) => ({
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      category: article.category,
    }))
  }

  getAdvice(slug: string) {
    const article = ADVICE_ARTICLES.find((item) => item.slug === slug)
    if (article === undefined) {
      throw notFound('Advice article not found')
    }
    return article
  }

  listWorksheets() {
    return SEED_DEFINITIONS.map((definition) => ({
      slug: definition.slug,
      title: definition.title,
      purpose: definition.purpose,
      chapterReference: definition.chapterReference,
      repeatable: definition.repeatable,
      licenceStatus: definition.licenceStatus ?? 'original',
      fieldSchema: toFieldSchema(definition),
    }))
  }

  getWorksheet(slug: string) {
    const definition = SEED_DEFINITIONS.find((item) => item.slug === slug)
    if (definition === undefined) {
      throw notFound('Worksheet not found')
    }
    return {
      slug: definition.slug,
      title: definition.title,
      purpose: definition.purpose,
      chapterReference: definition.chapterReference,
      repeatable: definition.repeatable,
      licenceStatus: definition.licenceStatus ?? 'original',
      fieldSchema: toFieldSchema(definition),
    }
  }

  async listEntries(userId: string, slug?: string) {
    const query = this.db('worksheet_entries')
      .where({ user_id: userId })
      .orderBy('updated_at', 'desc')
    if (slug !== undefined) {
      query.andWhere({ definition_slug: slug })
    }
    const rows = await query
    return rows.map((row) => this.toEntry(row))
  }

  async upsertEntry(
    userId: string,
    slug: string,
    responses: Record<string, unknown>,
    status: 'draft' | 'submitted',
    entryId?: string,
  ) {
    this.getWorksheet(slug)
    if (entryId !== undefined) {
      await this.db('worksheet_entries')
        .where({ id: entryId, user_id: userId })
        .update({
          responses: JSON.stringify(responses),
          status,
          submitted_at: status === 'submitted' ? new Date() : null,
          updated_at: new Date(),
        })
      const updated = await this.db('worksheet_entries')
        .where({ id: entryId, user_id: userId })
        .first()
      if (updated === undefined) {
        throw notFound('Worksheet entry not found')
      }
      return this.toEntry(updated)
    }

    const id = uuid()
    await this.db('worksheet_entries').insert({
      id,
      user_id: userId,
      definition_slug: slug,
      status,
      responses: JSON.stringify(responses),
      submitted_at: status === 'submitted' ? new Date() : null,
    })
    const created = await this.db('worksheet_entries').where({ id }).first()
    if (created === undefined) {
      throw notFound('Worksheet entry was not saved')
    }
    return this.toEntry(created)
  }

  private toEntry(row: {
    id: string
    definition_slug: string
    status: 'draft' | 'submitted'
    responses: Record<string, unknown>
    submitted_at: Date | string | null
    created_at: Date | string
    updated_at: Date | string
  }) {
    return {
      id: row.id,
      definitionSlug: row.definition_slug,
      status: row.status,
      responses: row.responses,
      submittedAt: row.submitted_at === null ? null : new Date(row.submitted_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }
  }
}
