import OpenAI from 'openai'
import type { Env } from '../../config/env.js'

export function createOpenAi(env: Env): OpenAI | null {
  if (env.OPENAI_API_KEY === undefined) {
    return null
  }
  return new OpenAI({ apiKey: env.OPENAI_API_KEY })
}

export async function completeChat(
  client: OpenAI | null,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
): Promise<string> {
  if (client === null) {
    return localFallback(system, messages)
  }

  const response = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [{ role: 'system', content: system }, ...messages],
  })

  return response.choices[0]?.message.content?.trim() ?? localFallback(system, messages)
}

function localFallback(system: string, messages: { role: string; content: string }[]): string {
  const last = messages[messages.length - 1]?.content ?? ''
  const hasNights = system.includes('Most recent night:')
  if (last.length === 0 && hasNights) {
    return 'I can coach from the nights already in your diary. Keep a regular rise time, and go to bed only when sleepy.'
  }
  if (last.length === 0) {
    return 'I can help with your sleep plan once you log a night in the diary or sync Health. Until then: keep a regular rise time.'
  }
  if (hasNights) {
    return 'I can only help with sleep and CBT-I. Use last night’s diary as the ground truth: protect your rise time, go to bed only when sleepy, and keep the window honest.'
  }
  return 'I can only help with sleep and CBT-I. Log last night in the diary or sync Health so I can coach from your actual nights.'
}
