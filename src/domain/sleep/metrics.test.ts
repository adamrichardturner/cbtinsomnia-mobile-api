import { describe, expect, it } from 'vitest'
import { computeNightMetrics, minutesBetweenClocks, subtractMinutesFromClock } from './metrics.js'
import type { HealthInterval } from './types.js'

function interval(
  startedAt: string,
  endedAt: string,
  stage: HealthInterval['stage'],
  sourceName: string,
): HealthInterval {
  return {
    startedAt,
    endedAt,
    stage,
    sourceName,
    durationMins: Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000,
    ),
  }
}

describe('sleep metrics', () => {
  it('computes efficiency from a typical diary night', () => {
    const metrics = computeNightMetrics({
      nightDate: '2026-09-05',
      timeZone: 'Europe/London',
      bedTime: '23:30',
      lightsOutTime: '23:30',
      sleepOnsetLatencyMins: 30,
      wasoMins: 20,
      finalWakeTime: '07:00',
      outOfBedTime: '07:10',
      totalSleepMinsOverride: null,
      earlyMorningAwakeMins: null,
      healthIntervals: [],
    })

    expect(metrics.timeInBedMins).toBe(460)
    expect(metrics.totalSleepMins).toBe(400)
    expect(metrics.sleepEfficiencyPct).toBe(87)
  })

  it('unions overlapping in-bed samples instead of summing them', () => {
    const metrics = computeNightMetrics({
      nightDate: '2026-09-05',
      timeZone: 'Europe/London',
      bedTime: null,
      lightsOutTime: null,
      sleepOnsetLatencyMins: null,
      wasoMins: null,
      finalWakeTime: null,
      outOfBedTime: null,
      totalSleepMinsOverride: null,
      earlyMorningAwakeMins: null,
      healthIntervals: [
        interval('2026-09-05T22:00:00.000Z', '2026-09-06T06:00:00.000Z', 'inBed', 'Watch'),
        interval('2026-09-05T22:00:00.000Z', '2026-09-06T06:00:00.000Z', 'inBed', 'iPhone'),
        interval('2026-09-05T22:20:00.000Z', '2026-09-06T05:40:00.000Z', 'core', 'Watch'),
      ],
    })

    expect(metrics.timeInBedMins).toBe(480)
    expect(metrics.totalSleepMins).toBe(440)
    expect(metrics.coreMins).toBe(440)
  })

  it('uses the main night session, not an afternoon nap, for time in bed', () => {
    const metrics = computeNightMetrics({
      nightDate: '2026-09-05',
      timeZone: 'Europe/London',
      bedTime: null,
      lightsOutTime: null,
      sleepOnsetLatencyMins: null,
      wasoMins: null,
      finalWakeTime: null,
      outOfBedTime: null,
      totalSleepMinsOverride: null,
      earlyMorningAwakeMins: null,
      healthIntervals: [
        interval('2026-09-05T14:00:00.000Z', '2026-09-05T14:40:00.000Z', 'inBed', 'Watch'),
        interval('2026-09-05T14:05:00.000Z', '2026-09-05T14:35:00.000Z', 'asleep', 'Watch'),
        interval('2026-09-05T23:12:00.000Z', '2026-09-06T07:08:00.000Z', 'inBed', 'Watch'),
        interval('2026-09-05T23:30:00.000Z', '2026-09-06T00:10:00.000Z', 'core', 'Watch'),
        interval('2026-09-06T00:10:00.000Z', '2026-09-06T01:20:00.000Z', 'deep', 'Watch'),
        interval('2026-09-06T01:20:00.000Z', '2026-09-06T02:50:00.000Z', 'rem', 'Watch'),
        interval('2026-09-06T02:50:00.000Z', '2026-09-06T07:00:00.000Z', 'core', 'Watch'),
      ],
    })

    expect(metrics.timeInBedMins).toBe(476)
    expect(metrics.totalSleepMins).toBe(450)
    expect(metrics.remMins).toBe(90)
    expect(metrics.deepMins).toBe(70)
  })

  it('wraps clock arithmetic across midnight', () => {
    expect(minutesBetweenClocks('23:00', '07:00')).toBe(480)
    expect(subtractMinutesFromClock('07:00', 360)).toBe('01:00')
  })
})
