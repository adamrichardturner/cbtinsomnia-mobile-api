const OFF_TOPIC_PATTERNS = [
  /\b(code|python|javascript|homework|essay|recipe|stock|crypto|bitcoin)\b/i,
  /\b(write me a|generate a story|roleplay)\b/i,
]

const SLEEP_HINTS = [
  'sleep',
  'insomnia',
  'awake',
  'bed',
  'nap',
  'tired',
  'sleepy',
  'dream',
  'night',
  'diary',
  'schedule',
  'window',
  'caffeine',
  'worry',
  'racing',
  'wind-down',
  'cbti',
  'cbt-i',
  'fatigue',
  'rest',
]

export function looksLikeSleepTopic(message: string): boolean {
  const lowered = message.toLowerCase()
  for (const hint of SLEEP_HINTS) {
    if (lowered.includes(hint)) {
      return true
    }
  }
  return message.trim().length < 80
}

export function isClearlyOffTopic(message: string): boolean {
  if (looksLikeSleepTopic(message)) {
    return false
  }
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(message)) {
      return true
    }
  }
  return false
}

export const SYSTEM_PROMPT = `You are a CBT-I sleep coach for a mobile app grounded in Colin Espie's approach to insomnia (assessment, a protected sleep window, stimulus control, wind-down, and a racing-mind toolkit).

Rules:
- Only discuss sleep, insomnia, daytime sleepiness, the user's sleep plan, diary, Apple Health sleep data, and CBT-I skills.
- If the user asks about anything else, briefly refuse and steer back to sleep.
- Be warm, concise, and practical. Sound like a skilled coach, not a textbook.
- Do not diagnose, prescribe, or tell anyone to change medication.
- If there is risk of harm, driving while sleepy, or another sleep disorder (breathing pauses, sleep attacks), urge them to seek a clinician and pause tight scheduling.
- Never invent numbers. Use only the sleep context you are given.
- Do not reproduce copyrighted book prose. Use original wording.
- Prefer one or two next actions over long lectures.`

export const ANALYSIS_PROMPT = `You are a CBT-I performance coach, similar in tone to a running coach reviewing a session.

The user tapped Sleep Analysis. Review the requested period against their sleep plan.

Write:
1. A short headline (one sentence).
2. What the data showed (timing, efficiency, awakenings, stages if present).
3. How it lined up with their plan (threshold, rising time, window).
4. One or two CBT-I adjustments for the next 24 hours.

Stay kind. Do not catastrophise a single night. Do not invent missing data. Do not give medical advice.`

export function analysisUserPrompt(input: {
  period: 'night' | 'week' | 'month'
  nightDate?: string
}): string {
  if (input.period === 'week') {
    return 'Analyse the last week of sleep. Look for patterns across nights, not just one outlier.'
  }
  if (input.period === 'month') {
    return 'Analyse the last month of sleep. Summarise trends, consistency, and what to protect next.'
  }
  if (input.nightDate !== undefined) {
    return `Analyse the night of ${input.nightDate}.`
  }
  return 'Analyse last night.'
}

export const OFF_TOPIC_REPLY =
  'I can only help with sleep, insomnia, and your sleep plan. Ask me about last night, your schedule, or what to try at bedtime.'
