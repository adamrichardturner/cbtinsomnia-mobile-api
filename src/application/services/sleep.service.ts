import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import { computeNightMetrics } from '../../domain/sleep/metrics.js'
import type {
  ConfirmationState,
  HealthInterval,
  NightMetrics,
  NightSource,
  SleepDiaryFields,
  SleepThumb,
} from '../../domain/sleep/types.js'
import { isoDateOnly } from '../../shared/dates.js'
import { notFound } from '../../shared/errors.js'

export interface SleepNightRecord extends SleepDiaryFields {
  id: string
  userId: string
  nightDate: string
  timeZone: string
  source: NightSource
  confirmationState: ConfirmationState
  healthIntervals: HealthInterval[]
  metrics: NightMetrics
  healthSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

interface NightRow {
  id: string
  user_id: string
  night_date: Date | string
  time_zone: string
  source: NightSource
  confirmation_state: ConfirmationState
  bed_time: string | null
  lights_out_time: string | null
  sleep_onset_latency_mins: number | null
  awakenings_count: number | null
  waso_mins: number | null
  final_wake_time: string | null
  out_of_bed_time: string | null
  total_sleep_mins: number | null
  early_morning_awake_mins: number | null
  alcohol_units: string | number | null
  sleep_medication_taken: boolean | null
  sleep_medication_name: string | null
  sleep_medication_dose: string | null
  restfulness_rating: number | null
  sleep_quality_rating: number | null
  sleep_thumb: string | null
  factors: string[]
  notes: string | null
  notes_html: string | null
  health_intervals: HealthInterval[]
  metrics: NightMetrics
  health_synced_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

export interface HealthNightPayload {
  nightDate: string
  timeZone: string
  intervals: HealthInterval[]
  bedTime?: string | null
  finalWakeTime?: string | null
  outOfBedTime?: string | null
}

export class SleepService {
  constructor(private readonly db: Knex) {}

  async listNights(userId: string, limit = 42): Promise<SleepNightRecord[]> {
    const rows = await this.db<NightRow>('sleep_nights')
      .where({ user_id: userId })
      .orderBy('night_date', 'desc')
      .limit(limit)
    return rows.map((row) => this.toRecord(row))
  }

  async getNight(userId: string, nightDate: string): Promise<SleepNightRecord> {
    const row = await this.db<NightRow>('sleep_nights')
      .where({ user_id: userId, night_date: nightDate })
      .first()
    if (row === undefined) {
      throw notFound('No diary for that night')
    }
    return this.toRecord(row)
  }

  async upsertDiary(
    userId: string,
    nightDate: string,
    timeZone: string,
    fields: Partial<SleepDiaryFields>,
  ): Promise<SleepNightRecord> {
    const existing = await this.db<NightRow>('sleep_nights')
      .where({ user_id: userId, night_date: nightDate })
      .first()

    const merged = this.mergeFields(existing, fields)
    const healthIntervals = existing?.health_intervals ?? []
    const metrics = computeNightMetrics({
      nightDate,
      timeZone,
      bedTime: merged.bedTime,
      lightsOutTime: merged.lightsOutTime,
      sleepOnsetLatencyMins: merged.sleepOnsetLatencyMins,
      wasoMins: merged.wasoMins,
      finalWakeTime: merged.finalWakeTime,
      outOfBedTime: merged.outOfBedTime,
      totalSleepMinsOverride: merged.totalSleepMins,
      earlyMorningAwakeMins: merged.earlyMorningAwakeMins,
      healthIntervals,
    })

    const source: NightSource =
      healthIntervals.length > 0 && this.hasManual(merged)
        ? 'merged'
        : (existing?.source ?? 'manual')

    if (existing === undefined) {
      const id = uuid()
      await this.db('sleep_nights').insert({
        id,
        user_id: userId,
        night_date: nightDate,
        time_zone: timeZone,
        source,
        confirmation_state: 'confirmed',
        ...this.toColumns(merged),
        health_intervals: JSON.stringify(healthIntervals),
        metrics: JSON.stringify(metrics),
      })
      return this.getNight(userId, nightDate)
    }

    await this.db('sleep_nights')
      .where({ id: existing.id })
      .update({
        time_zone: timeZone,
        source,
        ...this.toColumns(merged),
        metrics: JSON.stringify(metrics),
        updated_at: new Date(),
      })
    return this.getNight(userId, nightDate)
  }

  async syncHealth(userId: string, nights: HealthNightPayload[]): Promise<SleepNightRecord[]> {
    const saved: SleepNightRecord[] = []
    for (const night of nights) {
      const existing = await this.db<NightRow>('sleep_nights')
        .where({ user_id: userId, night_date: night.nightDate })
        .first()
      const fields = this.mergeFields(existing, {
        bedTime: night.bedTime ?? existing?.bed_time ?? null,
        finalWakeTime: night.finalWakeTime ?? existing?.final_wake_time ?? null,
        outOfBedTime: night.outOfBedTime ?? existing?.out_of_bed_time ?? null,
      })
      const metrics = computeNightMetrics({
        nightDate: night.nightDate,
        timeZone: night.timeZone,
        bedTime: fields.bedTime,
        lightsOutTime: fields.lightsOutTime,
        sleepOnsetLatencyMins: fields.sleepOnsetLatencyMins,
        wasoMins: fields.wasoMins,
        finalWakeTime: fields.finalWakeTime,
        outOfBedTime: fields.outOfBedTime,
        totalSleepMinsOverride: fields.totalSleepMins,
        earlyMorningAwakeMins: fields.earlyMorningAwakeMins,
        healthIntervals: night.intervals,
      })
      const source: NightSource = this.hasManual(fields) ? 'merged' : 'health'

      if (existing === undefined) {
        await this.db('sleep_nights').insert({
          id: uuid(),
          user_id: userId,
          night_date: night.nightDate,
          time_zone: night.timeZone,
          source,
          confirmation_state: 'confirmed',
          ...this.toColumns(fields),
          health_intervals: JSON.stringify(night.intervals),
          metrics: JSON.stringify(metrics),
          health_synced_at: new Date(),
        })
      } else {
        await this.db('sleep_nights')
          .where({ id: existing.id })
          .update({
            source,
            health_intervals: JSON.stringify(night.intervals),
            metrics: JSON.stringify(metrics),
            bed_time: fields.bedTime,
            final_wake_time: fields.finalWakeTime,
            out_of_bed_time: fields.outOfBedTime,
            health_synced_at: new Date(),
            updated_at: new Date(),
          })
      }
      saved.push(await this.getNight(userId, night.nightDate))
    }
    return saved
  }

  async summary(
    userId: string,
    days = 28,
  ): Promise<{
    nights: SleepNightRecord[]
    lastNight: SleepNightRecord | null
    averages: {
      totalSleepMins: number | null
      sleepEfficiencyPct: number | null
      timeInBedMins: number | null
      sleepOnsetLatencyMins: number | null
      nightsCounted: number
    }
    previousAverages: {
      totalSleepMins: number | null
      sleepEfficiencyPct: number | null
      nightsCounted: number
    }
  }> {
    const windowDays = Math.min(Math.max(days, 1), 90)
    const nights = await this.listNights(userId, Math.max(windowDays * 2, 31))
    const recent = nights.slice(0, windowDays)
    const previous = nights.slice(windowDays, windowDays * 2)
    return {
      nights: recent,
      lastNight: nights[0] ?? null,
      averages: this.averageMetrics(recent),
      previousAverages: {
        totalSleepMins: this.mean(previous.map((night) => night.metrics.totalSleepMins)),
        sleepEfficiencyPct: this.mean(previous.map((night) => night.metrics.sleepEfficiencyPct)),
        nightsCounted: previous.length,
      },
    }
  }

  private averageMetrics(nights: SleepNightRecord[]): {
    totalSleepMins: number | null
    sleepEfficiencyPct: number | null
    timeInBedMins: number | null
    sleepOnsetLatencyMins: number | null
    nightsCounted: number
  } {
    return {
      totalSleepMins: this.mean(nights.map((night) => night.metrics.totalSleepMins)),
      sleepEfficiencyPct: this.mean(nights.map((night) => night.metrics.sleepEfficiencyPct)),
      timeInBedMins: this.mean(nights.map((night) => night.metrics.timeInBedMins)),
      sleepOnsetLatencyMins: this.mean(nights.map((night) => night.metrics.sleepOnsetLatencyMins)),
      nightsCounted: nights.length,
    }
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
    return Math.round((sum / present.length) * 10) / 10
  }

  private hasManual(fields: SleepDiaryFields): boolean {
    return (
      fields.notes !== null ||
      fields.notesHtml !== null ||
      fields.sleepThumb !== null ||
      fields.restfulnessRating !== null ||
      fields.sleepQualityRating !== null ||
      fields.sleepOnsetLatencyMins !== null
    )
  }

  private mergeFields(
    existing: NightRow | undefined,
    patch: Partial<SleepDiaryFields>,
  ): SleepDiaryFields {
    return {
      bedTime: patch.bedTime ?? existing?.bed_time ?? null,
      lightsOutTime: patch.lightsOutTime ?? existing?.lights_out_time ?? null,
      sleepOnsetLatencyMins:
        patch.sleepOnsetLatencyMins ?? existing?.sleep_onset_latency_mins ?? null,
      awakeningsCount: patch.awakeningsCount ?? existing?.awakenings_count ?? null,
      wasoMins: patch.wasoMins ?? existing?.waso_mins ?? null,
      finalWakeTime: patch.finalWakeTime ?? existing?.final_wake_time ?? null,
      outOfBedTime: patch.outOfBedTime ?? existing?.out_of_bed_time ?? null,
      totalSleepMins: patch.totalSleepMins ?? existing?.total_sleep_mins ?? null,
      earlyMorningAwakeMins:
        patch.earlyMorningAwakeMins ?? existing?.early_morning_awake_mins ?? null,
      alcoholUnits:
        patch.alcoholUnits ??
        (existing?.alcohol_units === null || existing?.alcohol_units === undefined
          ? null
          : Number(existing.alcohol_units)),
      sleepMedicationTaken: patch.sleepMedicationTaken ?? existing?.sleep_medication_taken ?? null,
      sleepMedicationName: patch.sleepMedicationName ?? existing?.sleep_medication_name ?? null,
      sleepMedicationDose: patch.sleepMedicationDose ?? existing?.sleep_medication_dose ?? null,
      restfulnessRating: patch.restfulnessRating ?? existing?.restfulness_rating ?? null,
      sleepQualityRating: patch.sleepQualityRating ?? existing?.sleep_quality_rating ?? null,
      sleepThumb: patch.sleepThumb ?? asSleepThumb(existing?.sleep_thumb) ?? null,
      factors: patch.factors ?? existing?.factors ?? [],
      notes: patch.notes ?? existing?.notes ?? null,
      notesHtml: patch.notesHtml ?? existing?.notes_html ?? null,
    }
  }

  private toColumns(fields: SleepDiaryFields): Record<string, unknown> {
    return {
      bed_time: fields.bedTime,
      lights_out_time: fields.lightsOutTime,
      sleep_onset_latency_mins: fields.sleepOnsetLatencyMins,
      awakenings_count: fields.awakeningsCount,
      waso_mins: fields.wasoMins,
      final_wake_time: fields.finalWakeTime,
      out_of_bed_time: fields.outOfBedTime,
      total_sleep_mins: fields.totalSleepMins,
      early_morning_awake_mins: fields.earlyMorningAwakeMins,
      alcohol_units: fields.alcoholUnits,
      sleep_medication_taken: fields.sleepMedicationTaken,
      sleep_medication_name: fields.sleepMedicationName,
      sleep_medication_dose: fields.sleepMedicationDose,
      restfulness_rating: fields.restfulnessRating,
      sleep_quality_rating: fields.sleepQualityRating,
      sleep_thumb: fields.sleepThumb,
      factors: JSON.stringify(fields.factors),
      notes: fields.notes,
      notes_html: fields.notesHtml,
    }
  }

  private toRecord(row: NightRow): SleepNightRecord {
    return {
      id: row.id,
      userId: row.user_id,
      nightDate: isoDateOnly(row.night_date),
      timeZone: row.time_zone,
      source: row.source,
      confirmationState: row.confirmation_state,
      bedTime: row.bed_time,
      lightsOutTime: row.lights_out_time,
      sleepOnsetLatencyMins: row.sleep_onset_latency_mins,
      awakeningsCount: row.awakenings_count,
      wasoMins: row.waso_mins,
      finalWakeTime: row.final_wake_time,
      outOfBedTime: row.out_of_bed_time,
      totalSleepMins: row.total_sleep_mins,
      earlyMorningAwakeMins: row.early_morning_awake_mins,
      alcoholUnits: row.alcohol_units === null ? null : Number(row.alcohol_units),
      sleepMedicationTaken: row.sleep_medication_taken,
      sleepMedicationName: row.sleep_medication_name,
      sleepMedicationDose: row.sleep_medication_dose,
      restfulnessRating: row.restfulness_rating,
      sleepQualityRating: row.sleep_quality_rating,
      sleepThumb: asSleepThumb(row.sleep_thumb),
      factors: row.factors ?? [],
      notes: row.notes,
      notesHtml: row.notes_html,
      healthIntervals: row.health_intervals ?? [],
      metrics: row.metrics,
      healthSyncedAt:
        row.health_synced_at === null ? null : new Date(row.health_synced_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }
  }
}

function asSleepThumb(value: string | null | undefined): SleepThumb | null {
  if (value === 'up' || value === 'down') {
    return value
  }
  return null
}
