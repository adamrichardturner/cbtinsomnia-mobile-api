import { loadEnv } from './config/env.js'
import { createApp } from './app.js'
import { AuthService } from './application/services/auth.service.js'
import { CoachService } from './application/services/coach.service.js'
import { ContentService } from './application/services/content.service.js'
import { PlanService } from './application/services/plan.service.js'
import { SleepService } from './application/services/sleep.service.js'
import { createDb } from './infrastructure/db/knex.js'
import { createOpenAi } from './infrastructure/openai/client.js'

const env = loadEnv()
const db = createDb(env)
const sleep = new SleepService(db)
const plans = new PlanService(db, sleep)
const auth = new AuthService(db, env)
const content = new ContentService(db)
const coach = new CoachService(db, createOpenAi(env), env.OPENAI_MODEL, sleep, plans)
const app = createApp({ env, auth, sleep, plans, coach, content })

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`cbtinsomnia-mobile-api listening on ${env.PORT}`)
})

function shutdown(): void {
  server.close(() => {
    void db.destroy().then(() => {
      process.exit(0)
    })
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
