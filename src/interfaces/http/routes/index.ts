import { Router } from 'express'
import { z } from 'zod'
import type { AuthService } from '../../../application/services/auth.service.js'
import type { CoachService } from '../../../application/services/coach.service.js'
import type { ContentService } from '../../../application/services/content.service.js'
import type { PlanService } from '../../../application/services/plan.service.js'
import type { SleepService } from '../../../application/services/sleep.service.js'
import type { Env } from '../../../config/env.js'
import { unauthorized } from '../../../shared/errors.js'
import { authenticate } from '../middleware/authenticate.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1).max(80),
  timeZone: z.string().min(1).default('Europe/London'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const oauthSchema = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(1),
  nonce: z.string().min(1).optional(),
  displayName: z.string().min(1).max(80).optional(),
  timeZone: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
})

const diarySchema = z.object({
  nightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1),
  bedTime: z.string().nullable().optional(),
  lightsOutTime: z.string().nullable().optional(),
  sleepOnsetLatencyMins: z.number().int().min(0).max(1440).nullable().optional(),
  awakeningsCount: z.number().int().min(0).max(30).nullable().optional(),
  wasoMins: z.number().int().min(0).max(1440).nullable().optional(),
  finalWakeTime: z.string().nullable().optional(),
  outOfBedTime: z.string().nullable().optional(),
  totalSleepMins: z.number().int().min(0).max(1440).nullable().optional(),
  earlyMorningAwakeMins: z.number().int().min(0).max(1440).nullable().optional(),
  alcoholUnits: z.number().min(0).max(60).nullable().optional(),
  sleepMedicationTaken: z.boolean().nullable().optional(),
  sleepMedicationName: z.string().nullable().optional(),
  sleepMedicationDose: z.string().nullable().optional(),
  restfulnessRating: z.number().int().min(0).max(4).nullable().optional(),
  sleepQualityRating: z.number().int().min(0).max(4).nullable().optional(),
  factors: z.array(z.string()).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  notesHtml: z.string().max(20_000).nullable().optional(),
})

const healthSyncSchema = z.object({
  nights: z.array(
    z.object({
      nightDate: z.string(),
      timeZone: z.string(),
      bedTime: z.string().nullable().optional(),
      finalWakeTime: z.string().nullable().optional(),
      outOfBedTime: z.string().nullable().optional(),
      intervals: z.array(
        z.object({
          startedAt: z.string(),
          endedAt: z.string(),
          stage: z.enum(['inBed', 'awake', 'asleep', 'core', 'deep', 'rem', 'unknown']),
          sourceName: z.string().nullable(),
          durationMins: z.number(),
        }),
      ),
    }),
  ),
})

export function createRouter(deps: {
  env: Env
  auth: AuthService
  sleep: SleepService
  plans: PlanService
  coach: CoachService
  content: ContentService
}): Router {
  const router = Router()
  const requireAuth = authenticate(deps.env)

  router.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  router.post('/v1/auth/register', async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body)
      res.status(201).json(await deps.auth.register(body))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/auth/login', async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body)
      res.json(await deps.auth.login(body.email, body.password))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/auth/oauth', async (req, res, next) => {
    try {
      const body = oauthSchema.parse(req.body)
      res.json(await deps.auth.oauth(body))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/auth/refresh', async (req, res, next) => {
    try {
      const refreshToken = z.object({ refreshToken: z.string() }).parse(req.body).refreshToken
      res.json(await deps.auth.refresh(refreshToken))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/auth/logout', async (req, res, next) => {
    try {
      const refreshToken = z.object({ refreshToken: z.string() }).parse(req.body).refreshToken
      await deps.auth.logout(refreshToken)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/me', requireAuth, async (req, res, next) => {
    try {
      res.json(await deps.auth.getUser(userId(req)))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/v1/me', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({
          displayName: z.string().min(1).optional(),
          timeZone: z.string().min(1).optional(),
          theme: z.enum(['light', 'dark', 'system']).optional(),
          diaryMode: z.enum(['simple', 'detailed']).optional(),
          healthSyncEnabled: z.boolean().optional(),
        })
        .parse(req.body)
      res.json(await deps.auth.updateUser(userId(req), body))
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/sleep/summary', requireAuth, async (req, res, next) => {
    try {
      const days = z.coerce.number().int().min(1).max(90).optional().parse(req.query.days)
      res.json(await deps.sleep.summary(userId(req), days ?? 30))
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/sleep/nights', requireAuth, async (req, res, next) => {
    try {
      res.json({ nights: await deps.sleep.listNights(userId(req)) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/sleep/nights/:nightDate', requireAuth, async (req, res, next) => {
    try {
      res.json(await deps.sleep.getNight(userId(req), String(req.params.nightDate)))
    } catch (error) {
      next(error)
    }
  })

  router.put('/v1/sleep/nights', requireAuth, async (req, res, next) => {
    try {
      const body = diarySchema.parse(req.body)
      const { nightDate, timeZone, ...fields } = body
      res.json(await deps.sleep.upsertDiary(userId(req), nightDate, timeZone, fields))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/sleep/health-sync', requireAuth, async (req, res, next) => {
    try {
      const body = healthSyncSchema.parse(req.body)
      res.json({ nights: await deps.sleep.syncHealth(userId(req), body.nights) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/plan', requireAuth, async (req, res, next) => {
    try {
      res.json({
        plan: await deps.plans.getActive(userId(req)),
        alignment: await deps.plans.alignment(userId(req)),
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/plan/preview', requireAuth, async (req, res, next) => {
    try {
      const risingTime = z.object({ risingTime: z.string() }).parse(req.body).risingTime
      res.json({ proposal: await deps.plans.preview(userId(req), risingTime) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/plan', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({
          risingTime: z.string(),
          thresholdTime: z.string().optional(),
          windowMinutes: z.number().int().min(300).max(720).optional(),
          linkIosSleepSchedule: z.boolean(),
          ackMayFeelSleepier: z.boolean(),
          ackNoDrivingWhenSleepy: z.boolean(),
          ackNotMedicalAdvice: z.boolean(),
          notes: z.string().optional(),
        })
        .parse(req.body)
      res.status(201).json(await deps.plans.create(userId(req), body))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/plan/status', requireAuth, async (req, res, next) => {
    try {
      const status = z
        .object({ status: z.enum(['active', 'paused', 'ended']) })
        .parse(req.body).status
      res.json(await deps.plans.setStatus(userId(req), status))
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/plan/checkin', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({
          checkinDate: z.string(),
          stayedUpToThreshold: z.boolean().optional(),
          bedOnlyWhenSleepy: z.boolean().optional(),
          gotUpAtRisingTime: z.boolean().optional(),
          followedItToday: z.boolean().optional(),
          sleepinessToday: z.number().int().min(0).max(4).optional(),
          notes: z.string().optional(),
        })
        .parse(req.body)
      await deps.plans.adherence(userId(req), body)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/chat', requireAuth, async (req, res, next) => {
    try {
      const thread = await deps.coach.getOrCreateThread(userId(req))
      const messages = await deps.coach.listMessages(userId(req), thread.id)
      res.json({ thread, messages })
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/chat/messages', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({ threadId: z.string().optional(), content: z.string().min(1).max(4000) })
        .parse(req.body)
      const thread = body.threadId
        ? { id: body.threadId, title: 'Sleep coach' }
        : await deps.coach.getOrCreateThread(userId(req))
      const messages = await deps.coach.sendMessage(userId(req), thread.id, body.content)
      res.json({ thread, messages })
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/analysis', requireAuth, async (req, res, next) => {
    try {
      res.json({ analysis: await deps.coach.latestAnalysis(userId(req)) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/analysis', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({
          period: z.enum(['night', 'week', 'month']).default('night'),
          nightDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .parse(req.body ?? {})
      res.json(await deps.coach.analyse(userId(req), body))
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/advice', (_req, res) => {
    res.json({ articles: deps.content.listAdvice() })
  })

  router.get('/v1/advice/:slug', (req, res, next) => {
    try {
      res.json(deps.content.getAdvice(String(req.params.slug)))
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/worksheets', (_req, res) => {
    res.json({ definitions: deps.content.listWorksheets() })
  })

  router.get('/v1/worksheets/:slug', (req, res, next) => {
    try {
      res.json(deps.content.getWorksheet(String(req.params.slug)))
    } catch (error) {
      next(error)
    }
  })

  router.get('/v1/worksheets/:slug/entries', requireAuth, async (req, res, next) => {
    try {
      res.json({ entries: await deps.content.listEntries(userId(req), String(req.params.slug)) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/v1/worksheets/:slug/entries', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({
          id: z.string().optional(),
          responses: z.record(z.string(), z.unknown()),
          status: z.enum(['draft', 'submitted']).default('draft'),
        })
        .parse(req.body)
      res.json(
        await deps.content.upsertEntry(
          userId(req),
          String(req.params.slug),
          body.responses,
          body.status,
          body.id,
        ),
      )
    } catch (error) {
      next(error)
    }
  })

  return router
}

function userId(req: { userId?: string }): string {
  if (req.userId === undefined) {
    throw unauthorized()
  }
  return req.userId
}
