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
    return localFallback(messages)
  }

  const response = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [{ role: 'system', content: system }, ...messages],
  })

  return response.choices[0]?.message.content?.trim() ?? localFallback(messages)
}

function localFallback(messages: { role: string; content: string }[]): string {
  const last = messages[messages.length - 1]?.content ?? ''
  if (last.length === 0) {
    return 'I can help with your sleep plan once the OpenAI key is configured. Until then: keep a regular rise time, and record last night in the diary.'
  }
  return 'I can only help with sleep and CBT-I. Keep last night’s diary honest, protect your rise time, and go to bed only when sleepy. Add an OpenAI key on the server for a fuller coach reply.'
}
