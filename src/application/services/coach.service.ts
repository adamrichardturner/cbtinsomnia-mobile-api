import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type OpenAI from 'openai'
import {
  ANALYSIS_PROMPT,
  isClearlyOffTopic,
  OFF_TOPIC_REPLY,
  SYSTEM_PROMPT,
} from '../../domain/chat/guardrails.js'
import { completeChat } from '../../infrastructure/openai/client.js'
import { notFound } from '../../shared/errors.js'
import type { PlanService } from './plan.service.js'
import type { SleepService } from './sleep.service.js'

export interface ChatMessageRecord {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
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

  async analyseLastNight(
    userId: string,
  ): Promise<{ id: string; nightDate: string; headline: string; body: string }> {
    const summary = await this.sleep.summary(userId)
    const last = summary.lastNight
    if (last === null) {
      throw notFound('No sleep recorded yet. Sync Health or write a diary first.')
    }
    const context = await this.buildContext(userId)
    const body = await completeChat(this.openai, this.model, `${ANALYSIS_PROMPT}\n\n${context}`, [
      {
        role: 'user',
        content: `Analyse the night of ${last.nightDate}.`,
      },
    ])
    const headline =
      body.split('\n').find((line) => line.trim().length > 0) ?? 'Last night in context'
    const id = uuid()
    await this.db('sleep_analyses').insert({
      id,
      user_id: userId,
      night_date: last.nightDate,
      headline: headline.replace(/^#+\s*/, '').slice(0, 180),
      body,
    })
    return { id, nightDate: last.nightDate, headline, body }
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
      nightDate: String(row.night_date).slice(0, 10),
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

  private async buildContext(userId: string): Promise<string> {
    const summary = await this.sleep.summary(userId)
    const alignment = await this.plans.alignment(userId)
    const last = summary.lastNight
    const plan = alignment.plan
    const lines = [
      'User sleep context (facts only):',
      `Recent nights counted: ${summary.averages.nightsCounted}`,
      `Average total sleep (mins): ${summary.averages.totalSleepMins}`,
      `Average sleep efficiency: ${summary.averages.sleepEfficiencyPct}`,
      `Average SOL (mins): ${summary.averages.sleepOnsetLatencyMins}`,
    ]
    if (last !== null) {
      lines.push(
        `Last night ${last.nightDate}: TST ${last.metrics.totalSleepMins}, TIB ${last.metrics.timeInBedMins}, SE ${last.metrics.sleepEfficiencyPct}, SOL ${last.metrics.sleepOnsetLatencyMins}, WASO ${last.metrics.wasoMins}, source ${last.source}`,
      )
      if (last.notes !== null) {
        lines.push(`Diary note: ${last.notes.slice(0, 500)}`)
      }
    }
    if (plan !== null) {
      lines.push(
        `Sleep plan: rise ${plan.risingTime}, threshold ${plan.thresholdTime}, window ${plan.windowMinutes} mins, status ${plan.status}`,
      )
    }
    return lines.join('\n')
  }
}
