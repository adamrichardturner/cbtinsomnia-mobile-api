import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type OpenAI from 'openai'
import {
  ANALYSIS_PROMPT,
  analysisUserPrompt,
  isClearlyOffTopic,
  OFF_TOPIC_REPLY,
  SYSTEM_PROMPT,
} from '../../domain/chat/guardrails.js'
import {
  averageNightMetrics,
  formatSleepContext,
  type PeriodAverages,
} from '../../domain/chat/sleep-context.js'
import { completeChat } from '../../infrastructure/openai/client.js'
import { isoDateOnly } from '../../shared/dates.js'
import { notFound } from '../../shared/errors.js'
import type { PlanService } from './plan.service.js'
import type { SleepService } from './sleep.service.js'

export type AnalysisPeriod = 'night' | 'week' | 'month'

export interface ChatMessageRecord {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface SleepAnalysisResult {
  id: string
  nightDate: string
  headline: string
  body: string
  period: AnalysisPeriod
  averages: PeriodAverages
}

export class CoachService {
  constructor(
    private readonly db: Knex,
    private readonly openai: OpenAI | null,
    private readonly model: string,
    private readonly sleep: SleepService,
    private readonly plans: PlanService,
  ) {}

  async getOrCreateThread(userId: string): Promise<{ id: string; title: string }> {
    const existing = await this.db('chat_threads')
      .where({ user_id: userId })
      .orderBy('updated_at', 'desc')
      .first()
    if (existing !== undefined) {
      return { id: existing.id, title: existing.title }
    }
    const id = uuid()
    await this.db('chat_threads').insert({ id, user_id: userId, title: 'Sleep coach' })
    return { id, title: 'Sleep coach' }
  }

  async listMessages(userId: string, threadId: string): Promise<ChatMessageRecord[]> {
    await this.requireThread(userId, threadId)
    const rows = await this.db('chat_messages')
      .where({ thread_id: threadId })
      .orderBy('created_at', 'asc')
    return rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at).toISOString(),
    }))
  }

  async sendMessage(
    userId: string,
    threadId: string,
    content: string,
  ): Promise<ChatMessageRecord[]> {
    await this.requireThread(userId, threadId)
    const userMessageId = uuid()
    await this.db('chat_messages').insert({
      id: userMessageId,
      thread_id: threadId,
      user_id: userId,
      role: 'user',
      content,
    })

    if (isClearlyOffTopic(content)) {
      await this.insertAssistant(userId, threadId, OFF_TOPIC_REPLY)
      return this.listMessages(userId, threadId)
    }

    const context = await this.buildContext(userId)
    const history = await this.listMessages(userId, threadId)
    const reply = await completeChat(this.openai, this.model, `${SYSTEM_PROMPT}\n\n${context}`, [
      ...history.slice(-16).map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ])
    await this.insertAssistant(userId, threadId, reply)
    await this.db('chat_threads').where({ id: threadId }).update({ updated_at: new Date() })
    return this.listMessages(userId, threadId)
  }

  async analyseLastNight(userId: string): Promise<SleepAnalysisResult> {
    return this.analyse(userId, { period: 'night' })
  }

  async analyse(
    userId: string,
    input: { period: AnalysisPeriod; nightDate?: string },
  ): Promise<SleepAnalysisResult> {
    const limit = input.period === 'month' ? 31 : input.period === 'week' ? 7 : 42
    const nights = await this.sleep.listNights(userId, limit)
    if (nights.length === 0) {
      throw notFound('No sleep recorded yet. Sync Health or write a diary first.')
    }

    const target =
      input.period === 'night' && input.nightDate !== undefined
        ? nights.find((night) => night.nightDate === input.nightDate)
        : nights[0]
    if (target === undefined) {
      throw notFound('No sleep recorded for that night yet.')
    }

    const reviewNights = input.period === 'night' ? [target] : nights
    const averages = averageNightMetrics(reviewNights)
    const contextNights = input.period === 'night' ? nights.slice(0, 7) : nights
    const context = await this.buildContext(userId, contextNights)
    const body = await completeChat(this.openai, this.model, `${ANALYSIS_PROMPT}\n\n${context}`, [
      {
        role: 'user',
        content: analysisUserPrompt(input),
      },
    ])
    const rawHeadline =
      body.split('\n').find((line) => line.trim().length > 0) ?? 'Sleep in context'
    const headline = cleanHeadline(rawHeadline)
    const id = uuid()
    await this.db('sleep_analyses').insert({
      id,
      user_id: userId,
      night_date: target.nightDate,
      headline: headline.slice(0, 180),
      body,
    })
    return { id, nightDate: target.nightDate, headline, body, period: input.period, averages }
  }

  async latestAnalysis(userId: string): Promise<{
    id: string
    nightDate: string
    headline: string
    body: string
    createdAt: string
  } | null> {
    const row = await this.db('sleep_analyses')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .first()
    if (row === undefined) {
      return null
    }
    return {
      id: row.id,
      nightDate: isoDateOnly(row.night_date),
      headline: row.headline,
      body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
    }
  }

  private async insertAssistant(userId: string, threadId: string, content: string): Promise<void> {
    await this.db('chat_messages').insert({
      id: uuid(),
      thread_id: threadId,
      user_id: userId,
      role: 'assistant',
      content,
    })
  }

  private async requireThread(userId: string, threadId: string): Promise<void> {
    const row = await this.db('chat_threads').where({ id: threadId, user_id: userId }).first()
    if (row === undefined) {
      throw notFound('Chat not found')
    }
  }

  private async buildContext(
    userId: string,
    nightsOverride?: Awaited<ReturnType<SleepService['listNights']>>,
  ): Promise<string> {
    const nights = nightsOverride ?? (await this.sleep.listNights(userId, 14))
    const alignment = await this.plans.alignment(userId)
    return formatSleepContext({
      nights,
      plan: alignment.plan,
      alignmentNights: alignment.nights,
    })
  }
}

function cleanHeadline(line: string): string {
  const withoutHash = line.replace(/^#+\s*/, '').trim()
  const wrapped = /^\*\*(.+)\*\*$/.exec(withoutHash)
  if (wrapped !== null) {
    return (wrapped[1] ?? withoutHash).replace(/\*\*/g, '').trim()
  }
  return withoutHash.replace(/\*\*/g, '').trim()
}
