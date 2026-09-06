import type { HealthInterval, NightMetrics } from './types.js'

export const METRICS_VERSION = '2026.1-mobile'
const MINUTES_PER_DAY = 1_440

export interface MetricsInput {
  nightDate: string
  timeZone: string
  bedTime: string | null
  lightsOutTime: string | null
  sleepOnsetLatencyMins: number | null
  wasoMins: number | null
  finalWakeTime: string | null
  outOfBedTime: string | null
  totalSleepMinsOverride: number | null
  earlyMorningAwakeMins: number | null
  healthIntervals: HealthInterval[]
}

export function computeNightMetrics(input: MetricsInput): NightMetrics {
  const fromHealth = metricsFromHealth(input.healthIntervals)
  if (fromHealth !== null) {
    return mergeManualOverrides(fromHealth, input)
  }

  return computeFromDiary(input)
}

export function clockToMinutes(clock: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock)
  if (match === null) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours * 60 + minutes
}

export function minutesToClock(total: number): string {
  const normalized = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function subtractMinutesFromClock(clock: string, minutesToSubtract: number): string {
  const start = clockToMinutes(clock)
  if (start === null) {
    return clock
  }
  return minutesToClock(start - minutesToSubtract)
}

export function minutesBetweenClocks(startClock: string, endClock: string): number | null {
  const start = clockToMinutes(startClock)
  const end = clockToMinutes(endClock)
  if (start === null || end === null) {
    return null
  }
  if (end >= start) {
    return end - start
  }
  return MINUTES_PER_DAY - start + end
}

function computeFromDiary(input: MetricsInput): NightMetrics {
  const bed = input.bedTime
  const lightsOut = input.lightsOutTime ?? input.bedTime
  const finalWake = input.finalWakeTime
  const outOfBed = input.outOfBedTime ?? input.finalWakeTime
  const timeInBedMins =
    bed !== null && outOfBed !== null ? minutesBetweenClocks(bed, outOfBed) : null
  const sol = input.sleepOnsetLatencyMins
  const waso = input.wasoMins
  const early =
    input.earlyMorningAwakeMins ??
    (finalWake !== null && outOfBed !== null ? minutesBetweenClocks(finalWake, outOfBed) : null)

  let totalSleepMins = input.totalSleepMinsOverride
  if (
    totalSleepMins === null &&
    lightsOut !== null &&
    finalWake !== null &&
    sol !== null &&
    waso !== null
  ) {
    const span = minutesBetweenClocks(lightsOut, finalWake)
    if (span !== null) {
      totalSleepMins = Math.max(span - sol - waso, 0)
    }
  }

  const totalWakeTimeMins =
    sol !== null && waso !== null && early !== null ? sol + waso + early : null
  const sleepEfficiencyPct = efficiency(totalSleepMins, timeInBedMins)

  return {
    timeInBedMins,
    totalSleepMins: sleepEfficiencyPct === null && totalSleepMins !== null ? null : totalSleepMins,
    totalWakeTimeMins,
    sleepEfficiencyPct,
    sleepOnsetLatencyMins: sol,
    wasoMins: waso,
    earlyMorningAwakeMins: early,
    coreMins: null,
    deepMins: null,
    remMins: null,
    metricsVersion: METRICS_VERSION,
  }
}

function metricsFromHealth(intervals: HealthInterval[]): NightMetrics | null {
  if (intervals.length === 0) {
    return null
  }

  const sorted = [...intervals].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) {
    return null
  }

  let asleep = 0
  let awake = 0
  let inBed = 0
  let core = 0
  let deep = 0
  let rem = 0
  let firstAsleepAt: string | null = null
  let lastAsleepEnd: string | null = null

  for (const interval of sorted) {
    if (interval.stage === 'inBed') {
      inBed += interval.durationMins
      continue
    }
    if (interval.stage === 'awake') {
      awake += interval.durationMins
      continue
    }
    if (isAsleepStage(interval.stage)) {
      asleep += interval.durationMins
      firstAsleepAt = firstAsleepAt ?? interval.startedAt
      lastAsleepEnd = interval.endedAt
      if (interval.stage === 'core') {
        core += interval.durationMins
      }
      if (interval.stage === 'deep') {
        deep += interval.durationMins
      }
      if (interval.stage === 'rem') {
        rem += interval.durationMins
      }
    }
  }

  const sessionStart = first.startedAt
  const sessionEnd = last.endedAt
  const timeInBedMins =
    inBed > 0 ? inBed : Math.max(Math.round(msBetween(sessionStart, sessionEnd) / 60_000), 0)
  const sol =
    firstAsleepAt === null
      ? null
      : Math.max(Math.round(msBetween(sessionStart, firstAsleepAt) / 60_000), 0)
  const early =
    lastAsleepEnd === null
      ? null
      : Math.max(Math.round(msBetween(lastAsleepEnd, sessionEnd) / 60_000), 0)
  const sleepEfficiencyPct = efficiency(asleep, timeInBedMins)

  return {
    timeInBedMins,
    totalSleepMins: asleep,
    totalWakeTimeMins: awake + (sol ?? 0) + (early ?? 0),
    sleepEfficiencyPct,
    sleepOnsetLatencyMins: sol,
    wasoMins: awake,
    earlyMorningAwakeMins: early,
    coreMins: core > 0 ? core : null,
    deepMins: deep > 0 ? deep : null,
    remMins: rem > 0 ? rem : null,
    metricsVersion: METRICS_VERSION,
  }
}

function mergeManualOverrides(health: NightMetrics, input: MetricsInput): NightMetrics {
  return {
    ...health,
    sleepOnsetLatencyMins: input.sleepOnsetLatencyMins ?? health.sleepOnsetLatencyMins,
    wasoMins: input.wasoMins ?? health.wasoMins,
    totalSleepMins: input.totalSleepMinsOverride ?? health.totalSleepMins,
    earlyMorningAwakeMins: input.earlyMorningAwakeMins ?? health.earlyMorningAwakeMins,
    sleepEfficiencyPct: efficiency(
      input.totalSleepMinsOverride ?? health.totalSleepMins,
      health.timeInBedMins,
    ),
  }
}

function efficiency(totalSleepMins: number | null, timeInBedMins: number | null): number | null {
  if (totalSleepMins === null || timeInBedMins === null || timeInBedMins <= 0) {
    return null
  }
  const raw = (totalSleepMins / timeInBedMins) * 100
  if (raw > 100) {
    return null
  }
  return Math.round(raw * 10) / 10
}

function isAsleepStage(stage: HealthInterval['stage']): boolean {
  return stage === 'asleep' || stage === 'core' || stage === 'deep' || stage === 'rem'
}

function msBetween(startIso: string, endIso: string): number {
  return new Date(endIso).getTime() - new Date(startIso).getTime()
}
