import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import pino from 'pino'
import type { Env } from './config/env.js'
import type { AuthService } from './application/services/auth.service.js'
import type { CoachService } from './application/services/coach.service.js'
import type { ContentService } from './application/services/content.service.js'
import type { PlanService } from './application/services/plan.service.js'
import type { SleepService } from './application/services/sleep.service.js'
import { errorHandler } from './interfaces/http/middleware/error-handler.js'
import { createRouter } from './interfaces/http/routes/index.js'

export function createApp(deps: {
  env: Env
  auth: AuthService
  sleep: SleepService
  plans: PlanService
  coach: CoachService
  content: ContentService
}) {
  const app = express()
  const logger = pino({ level: deps.env.LOG_LEVEL })
  app.use(helmet())
  app.use(
    cors({
      origin: deps.env.MOBILE_ORIGIN === '*' ? true : deps.env.MOBILE_ORIGIN,
    }),
  )
  app.use(express.json({ limit: '2mb' }))
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, 'request')
    next()
  })
  app.use(createRouter(deps))
  app.use(errorHandler)
  return app
}
