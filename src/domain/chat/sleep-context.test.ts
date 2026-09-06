import { describe, expect, it } from 'vitest'
import { formatSleepContext, type SleepContextNight } from './sleep-context.js'

function night(overrides: Partial<SleepContextNight> = {}): SleepContextNight {
  return {
    nightDate: '2026-09-05',
    source: 'merged',
    bedTime: '23:30',
    lightsOutTime: '23:40',
    finalWakeTime: '07:00',
    outOfBedTime: '07:10',
    awakeningsCount: 2,
    alcoholUnits: 1,
    sleepMedicationTaken: false,
    sleepMedicationName: null,
    restfulnessRating: 2,
    sleepQualityRating: 1,
    factors: ['stress', 'caffeine_late'],
    notes: 'Woke at 3am and stayed up scrolling.',
    metrics: {
      totalSleepMins: 400,
      timeInBedMins: 460,
      sleepEfficiencyPct: 87,
      sleepOnsetLatencyMins: 22,
      wasoMins: 20,
      earlyMorningAwakeMins: 10,
      coreMins: 180,
      deepMins: 70,
      remMins: 90,
    },
    ...overrides,
  }
}

describe('formatSleepContext', () => {
  it('says when no nights are recorded and still includes the plan', () => {
    const text = formatSleepContext({
      nights: [],
      plan: {
        risingTime: '07:00',
        thresholdTime: '00:30',
        windowMinutes: 390,
        status: 'active',
      },
      alignmentNights: [],
    })

    expect(text).toContain('No nights recorded yet.')
    expect(text).toContain(
      'Sleep plan: rise 07:00, threshold 00:30, window 390 mins, status active',
    )
    expect(text).not.toContain('Most recent night:')
  })

  it('highlights the latest night with diary, stages, and plan alignment', () => {
    const text = formatSleepContext({
      nights: [night()],
      plan: {
        risingTime: '07:00',
        thresholdTime: '00:30',
        windowMinutes: 390,
        status: 'active',
      },
      alignmentNights: [{ nightDate: '2026-09-05', alignedRise: true, alignedWindow: false }],
    })

    expect(text).toContain('Most recent night: 2026-09-05, TST 400, TIB 460, SE 87')
    expect(text).toContain('bed 23:30')
    expect(text).toContain('wake 07:00')
    expect(text).toContain('stages core 180, deep 70, rem 90')
    expect(text).toContain('rise aligned yes')
    expect(text).toContain('window aligned no')
    expect(text).toContain('Diary 2026-09-05 restfulness: somewhat')
    expect(text).toContain('Diary 2026-09-05 quality: poor')
    expect(text).toContain('Diary 2026-09-05 factors: stress, caffeine_late')
    expect(text).toContain('Diary 2026-09-05 alcohol units: 1')
    expect(text).toContain('Diary 2026-09-05 sleep medication: none')
    expect(text).toContain('Diary note 2026-09-05: Woke at 3am and stayed up scrolling.')
  })

  it('averages across nights and keeps older nights after the latest', () => {
    const earlier = night({
      nightDate: '2026-09-04',
      notes: 'Quieter night.',
      restfulnessRating: 3,
      sleepQualityRating: 3,
      factors: [],
      alcoholUnits: null,
      sleepMedicationTaken: null,
      metrics: {
        totalSleepMins: 360,
        timeInBedMins: 440,
        sleepEfficiencyPct: 82,
        sleepOnsetLatencyMins: 30,
        wasoMins: 40,
        earlyMorningAwakeMins: null,
        coreMins: null,
        deepMins: null,
        remMins: null,
      },
    })
    const text = formatSleepContext({
      nights: [night(), earlier],
      plan: null,
      alignmentNights: [],
    })

    expect(text).toContain('Nights in this review: 2')
    expect(text).toContain('Average total sleep (mins): 380')
    expect(text).toContain('Average WASO (mins): 30')
    expect(text).toContain('Most recent night: 2026-09-05')
    expect(text).toContain('Night 2026-09-04, TST 360')
    expect(text).toContain('Sleep plan: none active.')
  })
})
