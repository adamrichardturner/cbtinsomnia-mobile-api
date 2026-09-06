import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o'),
  MOBILE_ORIGIN: z.string().min(1).default('*'),
  APPLE_CLIENT_IDS: z
    .string()
    .default('com.cbtinsomnia.mobile')
    .transform((value) => splitCsv(value)),
  GOOGLE_CLIENT_IDS: z
    .string()
    .optional()
    .transform((value) => splitCsv(value)),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | undefined

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  if (cached !== undefined) {
    return cached
  }
  cached = envSchema.parse(raw)
  return cached
}

export function resetEnvCache(): void {
  cached = undefined
}

function splitCsv(value: string | undefined): string[] {
  if (value === undefined) {
    return []
  }
  const ids: string[] = []
  const parts = value.split(',')
  for (const part of parts) {
    const id = part.trim()
    if (id.length > 0) {
      ids.push(id)
    }
  }
  return ids
}
