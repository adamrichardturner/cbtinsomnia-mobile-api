import { subtractMinutesFromClock } from './metrics.js'

export const MIN_WINDOW_MINUTES = 300
export const EXTEND_MINUTES = 15
export const EXTEND_EFFICIENCY_THRESHOLD = 90
export const CALC_WINDOW_DAYS = 14
export const CALC_MIN_NIGHTS = 7
export const CALC_MAX_NIGHTS = 10

export interface QualifyingNight {
  nightDate: string
  totalSleepMins: number | null
  sleepEfficiencyPct: number | null
}

export interface ScheduleProposal {
  risingTime: string
  thresholdTime: string
  windowMinutes: number
  averageSleepMinutes: number
  floorApplied: boolean
  nightsUsed: number
}

export function proposeSleepWindow(
  nights: QualifyingNight[],
  risingTime: string,
  asOfDate: string,
): ScheduleProposal | null {
  const windowStart = shiftDate(asOfDate, -CALC_WINDOW_DAYS)
  const inWindow = nights.filter((night) => {
    return (
      night.nightDate >= windowStart && night.nightDate <= asOfDate && night.totalSleepMins !== null
    )
  })
  const sorted = [...inWindow].sort((a, b) => b.nightDate.localeCompare(a.nightDate))
  const qualifying = sorted.slice(0, CALC_MAX_NIGHTS)

  if (qualifying.length < CALC_MIN_NIGHTS) {
    return null
  }

  let sum = 0
  let count = 0
  for (const night of qualifying) {
    if (night.totalSleepMins === null) {
      continue
    }
    sum += night.totalSleepMins
    count += 1
  }
  if (count === 0) {
    return null
  }

  const averageSleepMinutes = Math.round(sum / count)
  const windowMinutes = Math.max(averageSleepMinutes, MIN_WINDOW_MINUTES)

  return {
    risingTime,
    thresholdTime: subtractMinutesFromClock(risingTime, windowMinutes),
    windowMinutes,
    averageSleepMinutes,
    floorApplied: windowMinutes > averageSleepMinutes,
    nightsUsed: qualifying.length,
  }
}

export function canExtendWindow(meanEfficiency: number | null): boolean {
  if (meanEfficiency === null) {
    return false
  }
  return meanEfficiency >= EXTEND_EFFICIENCY_THRESHOLD
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
