export type DiaryMode = 'simple' | 'detailed'
export type ThemePreference = 'light' | 'dark' | 'system'
export type ConfirmationState = 'draft' | 'confirmed'
export type NightSource = 'manual' | 'health' | 'merged'
export type PlanStatus = 'draft' | 'active' | 'paused' | 'ended'
export type HealthStage = 'inBed' | 'awake' | 'asleep' | 'core' | 'deep' | 'rem' | 'unknown'

export interface HealthInterval {
  startedAt: string
  endedAt: string
  stage: HealthStage
  sourceName: string | null
  durationMins: number
}

export interface NightMetrics {
  timeInBedMins: number | null
  totalSleepMins: number | null
  totalWakeTimeMins: number | null
  sleepEfficiencyPct: number | null
  sleepOnsetLatencyMins: number | null
  wasoMins: number | null
  earlyMorningAwakeMins: number | null
  coreMins: number | null
  deepMins: number | null
  remMins: number | null
  metricsVersion: string
}

export interface SleepDiaryFields {
  bedTime: string | null
  lightsOutTime: string | null
  sleepOnsetLatencyMins: number | null
  awakeningsCount: number | null
  wasoMins: number | null
  finalWakeTime: string | null
  outOfBedTime: string | null
  totalSleepMins: number | null
  earlyMorningAwakeMins: number | null
  alcoholUnits: number | null
  sleepMedicationTaken: boolean | null
  sleepMedicationName: string | null
  sleepMedicationDose: string | null
  restfulnessRating: number | null
  sleepQualityRating: number | null
  factors: string[]
  notes: string | null
  notesHtml: string | null
}

export const SLEEP_FACTORS = [
  'caffeine_late',
  'alcohol',
  'stress',
  'illness',
  'pain',
  'noise',
  'travel',
  'shift',
  'other',
] as const

export type SleepFactor = (typeof SLEEP_FACTORS)[number]
