import { describe, expect, it } from 'vitest'
import { computeNightMetrics, minutesBetweenClocks, subtractMinutesFromClock } from './metrics.js'

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

  it('wraps clock arithmetic across midnight', () => {
    expect(minutesBetweenClocks('23:00', '07:00')).toBe(480)
    expect(subtractMinutesFromClock('07:00', 360)).toBe('01:00')
  })
})
