import type { HealthInterval, NightMetrics } from './types.js'

export const METRICS_VERSION = '2026.2-mobile'
const MINUTES_PER_DAY = 1_440
const SESSION_GAP_MINS = 180

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

  const session = primarySleepSession(intervals)
  if (session.length === 0) {
    return null
  }

  const inBedIntervals = intervalsWithStage(session, 'inBed')
  const awakeIntervals = intervalsWithStage(session, 'awake')
  const asleepIntervals = session.filter((interval) => isAsleepStage(interval.stage))
  const sessionStart = earliestStart(inBedIntervals) ?? earliestStart(session)
  const sessionEnd = latestEnd(inBedIntervals) ?? latestEnd(session)
  if (sessionStart === null || sessionEnd === null) {
    return null
  }

  const inBedUnion = unionMinutes(inBedIntervals)
  const timeInBedMins =
    inBedUnion > 0
      ? inBedUnion
      : Math.max(Math.round(msBetween(sessionStart, sessionEnd) / 60_000), 0)
  const asleep = unionMinutes(asleepIntervals)
  const awake = unionMinutes(awakeIntervals)
  const core = unionMinutes(intervalsWithStage(session, 'core'))
  const deep = unionMinutes(intervalsWithStage(session, 'deep'))
  const rem = unionMinutes(intervalsWithStage(session, 'rem'))
  const firstAsleepAt = earliestStart(asleepIntervals)
  const lastAsleepEnd = latestEnd(asleepIntervals)
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

function primarySleepSession(intervals: HealthInterval[]): HealthInterval[] {
  const clusters = clusterSessions(intervals)
  if (clusters.length === 0) {
    return []
  }

  let best = clusters[0] ?? []
  let bestSleep = unionMinutes(best.filter((interval) => isAsleepStage(interval.stage)))
  let bestSpan = sessionSpanMins(best)

  for (let index = 1; index < clusters.length; index += 1) {
    const cluster = clusters[index]
    if (cluster === undefined) {
      continue
    }
    const sleep = unionMinutes(cluster.filter((interval) => isAsleepStage(interval.stage)))
    const span = sessionSpanMins(cluster)
    if (sleep > bestSleep || (sleep === bestSleep && span > bestSpan)) {
      best = cluster
      bestSleep = sleep
      bestSpan = span
    }
  }

  return best
}

function clusterSessions(intervals: HealthInterval[]): HealthInterval[][] {
  const sorted = [...intervals].sort((left, right) => left.startedAt.localeCompare(right.startedAt))
  const clusters: HealthInterval[][] = []
  let current: HealthInterval[] = []

  for (const interval of sorted) {
    const previous = current[current.length - 1]
    if (previous === undefined) {
      current = [interval]
      continue
    }
    const gapMins = msBetween(previous.endedAt, interval.startedAt) / 60_000
    if (gapMins > SESSION_GAP_MINS) {
      clusters.push(current)
      current = [interval]
      continue
    }
    current.push(interval)
  }

  if (current.length > 0) {
    clusters.push(current)
  }
  return clusters
}

function intervalsWithStage(
  intervals: HealthInterval[],
  stage: HealthInterval['stage'],
): HealthInterval[] {
  const matched: HealthInterval[] = []
  for (const interval of intervals) {
    if (interval.stage === stage) {
      matched.push(interval)
    }
  }
  return matched
}

function unionMinutes(intervals: HealthInterval[]): number {
  if (intervals.length === 0) {
    return 0
  }

  const ranges = [...intervals].sort((left, right) => left.startedAt.localeCompare(right.startedAt))
  const first = ranges[0]
  if (first === undefined) {
    return 0
  }

  let totalMs = 0
  let rangeStart = first.startedAt
  let rangeEnd = first.endedAt

  for (let index = 1; index < ranges.length; index += 1) {
    const next = ranges[index]
    if (next === undefined) {
      continue
    }
    if (next.startedAt <= rangeEnd) {
      if (next.endedAt > rangeEnd) {
        rangeEnd = next.endedAt
      }
      continue
    }
    totalMs += msBetween(rangeStart, rangeEnd)
    rangeStart = next.startedAt
    rangeEnd = next.endedAt
  }

  totalMs += msBetween(rangeStart, rangeEnd)
  return Math.max(Math.round(totalMs / 60_000), 0)
}

function earliestStart(intervals: HealthInterval[]): string | null {
  let start: string | null = null
  for (const interval of intervals) {
    if (start === null || interval.startedAt < start) {
      start = interval.startedAt
    }
  }
  return start
}

function latestEnd(intervals: HealthInterval[]): string | null {
  let end: string | null = null
  for (const interval of intervals) {
    if (end === null || interval.endedAt > end) {
      end = interval.endedAt
    }
  }
  return end
}

function sessionSpanMins(intervals: HealthInterval[]): number {
  const start = earliestStart(intervals)
  const end = latestEnd(intervals)
  if (start === null || end === null) {
    return 0
  }
  return Math.max(Math.round(msBetween(start, end) / 60_000), 0)
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
