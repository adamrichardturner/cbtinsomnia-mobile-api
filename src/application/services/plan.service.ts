import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { canExtendWindow, proposeSleepWindow } from '../../domain/sleep/schedule.js'
import type { PlanStatus } from '../../domain/sleep/types.js'
import { badRequest, notFound } from '../../shared/errors.js'
import type { SleepService } from './sleep.service.js'

export interface SleepPlanRecord {
  id: string
  userId: string
  status: PlanStatus
  risingTime: string
  thresholdTime: string
  windowMinutes: number
  linkIosSleepSchedule: boolean
  ackMayFeelSleepier: boolean
  ackNoDrivingWhenSleepy: boolean
  ackNotMedicalAdvice: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export class PlanService {
  constructor(
    private readonly db: Knex,
    private readonly sleep: SleepService,
  ) {}

  async getActive(userId: string): Promise<SleepPlanRecord | null> {
    const row = await this.db('sleep_plans')
      .where({ user_id: userId })
      .whereIn('status', ['active', 'paused', 'draft'])
      .orderBy('created_at', 'desc')
      .first()
    if (row === undefined) {
      return null
    }
    return this.toRecord(row)
  }

  async preview(
    userId: string,
    risingTime: string,
  ): Promise<ReturnType<typeof proposeSleepWindow>> {
    const nights = await this.sleep.listNights(userId, 21)
    const today = new Date().toISOString().slice(0, 10)
    return proposeSleepWindow(
      nights.map((night) => ({
        nightDate: night.nightDate,
        totalSleepMins: night.metrics.totalSleepMins,
        sleepEfficiencyPct: night.metrics.sleepEfficiencyPct,
      })),
      risingTime,
      today,
    )
  }

  async create(
    userId: string,
    input: {
      risingTime: string
      thresholdTime?: string
      windowMinutes?: number
      linkIosSleepSchedule: boolean
      ackMayFeelSleepier: boolean
      ackNoDrivingWhenSleepy: boolean
      ackNotMedicalAdvice: boolean
      notes?: string
    },
  ): Promise<SleepPlanRecord> {
    if (!input.ackMayFeelSleepier || !input.ackNoDrivingWhenSleepy || !input.ackNotMedicalAdvice) {
      throw badRequest('Please accept the safety acknowledgements before starting a plan')
    }

    const preview = await this.preview(userId, input.risingTime)
    const thresholdTime = input.thresholdTime ?? preview?.thresholdTime
    const windowMinutes = input.windowMinutes ?? preview?.windowMinutes
    if (thresholdTime === undefined || windowMinutes === undefined) {
      throw badRequest(
        'Not enough nights yet to calculate a window. Set your own threshold and window, or log at least 7 nights.',
      )
    }

    await this.db('sleep_plans')
      .where({ user_id: userId })
      .whereIn('status', ['active', 'draft'])
      .update({
        status: 'ended',
        updated_at: new Date(),
      })

    const id = uuid()
    await this.db('sleep_plans').insert({
      id,
      user_id: userId,
      status: 'active',
      rising_time: input.risingTime,
      threshold_time: thresholdTime,
      window_minutes: windowMinutes,
      link_ios_sleep_schedule: input.linkIosSleepSchedule,
      ack_may_feel_sleepier: input.ackMayFeelSleepier,
      ack_no_driving_when_sleepy: input.ackNoDrivingWhenSleepy,
      ack_not_medical_advice: input.ackNotMedicalAdvice,
      notes: input.notes ?? null,
    })
    const created = await this.getActive(userId)
    if (created === null) {
      throw notFound('Plan was not saved')
    }
    return created
  }

  async setStatus(userId: string, status: PlanStatus): Promise<SleepPlanRecord> {
    const current = await this.getActive(userId)
    if (current === null) {
      throw notFound('No sleep plan yet')
    }
    await this.db('sleep_plans')
      .where({ id: current.id })
      .update({ status, updated_at: new Date() })
    const next = await this.getActive(userId)
    if (next === null) {
      throw notFound('No sleep plan yet')
    }
    return next
  }

  async adherence(
    userId: string,
    input: {
      checkinDate: string
      stayedUpToThreshold?: boolean
      bedOnlyWhenSleepy?: boolean
      gotUpAtRisingTime?: boolean
      followedItToday?: boolean
      sleepinessToday?: number
      notes?: string
    },
  ): Promise<void> {
    const plan = await this.getActive(userId)
    if (plan === null) {
      throw notFound('No sleep plan yet')
    }
    await this.db('plan_checkins')
      .insert({
        id: uuid(),
        user_id: userId,
        plan_id: plan.id,
        checkin_date: input.checkinDate,
        stayed_up_to_threshold: input.stayedUpToThreshold ?? null,
        bed_only_when_sleepy: input.bedOnlyWhenSleepy ?? null,
        got_up_at_rising_time: input.gotUpAtRisingTime ?? null,
        followed_it_today: input.followedItToday ?? null,
        sleepiness_today: input.sleepinessToday ?? null,
        notes: input.notes ?? null,
      })
      .onConflict(['user_id', 'checkin_date'])
      .merge()
  }

  async alignment(userId: string): Promise<{
    plan: SleepPlanRecord | null
    nights: Array<{
      nightDate: string
      alignedRise: boolean | null
      alignedWindow: boolean | null
      sleepEfficiencyPct: number | null
      totalSleepMins: number | null
    }>
    canExtend: boolean
  }> {
    const plan = await this.getActive(userId)
    const nights = await this.sleep.listNights(userId, 14)
    const mapped = nights.map((night) => ({
      nightDate: night.nightDate,
      alignedRise: this.nearClock(
        night.outOfBedTime ?? night.finalWakeTime,
        plan?.risingTime ?? null,
      ),
      alignedWindow: this.afterThreshold(night.bedTime, plan?.thresholdTime ?? null),
      sleepEfficiencyPct: night.metrics.sleepEfficiencyPct,
      totalSleepMins: night.metrics.totalSleepMins,
    }))
    const recentEfficiency = this.mean(
      nights.slice(0, 7).map((night) => night.metrics.sleepEfficiencyPct),
    )
    return {
      plan,
      nights: mapped,
      canExtend: canExtendWindow(recentEfficiency),
    }
  }

  private nearClock(actual: string | null, target: string | null): boolean | null {
    if (actual === null || target === null) {
      return null
    }
    return Math.abs(this.clockMins(actual) - this.clockMins(target)) <= 30
  }

  private afterThreshold(bedTime: string | null, threshold: string | null): boolean | null {
    if (bedTime === null || threshold === null) {
      return null
    }
    const bed = this.clockMins(bedTime)
    const gate = this.clockMins(threshold)
    if (bed >= 12 * 60 && gate < 12 * 60) {
      return true
    }
    return bed >= gate
  }

  private clockMins(clock: string): number {
    const [hours, minutes] = clock.split(':')
    return Number(hours) * 60 + Number(minutes)
  }

  private mean(values: Array<number | null>): number | null {
    const present: number[] = []
    for (const value of values) {
      if (value !== null) {
        present.push(value)
      }
    }
    if (present.length === 0) {
      return null
    }
    let sum = 0
    for (const value of present) {
      sum += value
    }
    return sum / present.length
  }

  private toRecord(row: {
    id: string
    user_id: string
    status: PlanStatus
    rising_time: string
    threshold_time: string
    window_minutes: number
    link_ios_sleep_schedule: boolean
    ack_may_feel_sleepier: boolean
    ack_no_driving_when_sleepy: boolean
    ack_not_medical_advice: boolean
    notes: string | null
    created_at: Date | string
    updated_at: Date | string
  }): SleepPlanRecord {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      risingTime: row.rising_time,
      thresholdTime: row.threshold_time,
      windowMinutes: row.window_minutes,
      linkIosSleepSchedule: row.link_ios_sleep_schedule,
      ackMayFeelSleepier: row.ack_may_feel_sleepier,
      ackNoDrivingWhenSleepy: row.ack_no_driving_when_sleepy,
      ackNotMedicalAdvice: row.ack_not_medical_advice,
      notes: row.notes,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }
  }
}
