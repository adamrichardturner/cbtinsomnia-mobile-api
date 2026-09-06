export interface SleepContextMetrics {
  totalSleepMins: number | null
  timeInBedMins: number | null
  sleepEfficiencyPct: number | null
  sleepOnsetLatencyMins: number | null
  wasoMins: number | null
  earlyMorningAwakeMins: number | null
  coreMins: number | null
  deepMins: number | null
  remMins: number | null
}

export interface SleepContextNight {
  nightDate: string
  source: string
  bedTime: string | null
  lightsOutTime: string | null
  finalWakeTime: string | null
  outOfBedTime: string | null
  awakeningsCount: number | null
  alcoholUnits: number | null
  sleepMedicationTaken: boolean | null
  sleepMedicationName: string | null
  restfulnessRating: number | null
  sleepQualityRating: number | null
  factors: string[]
  notes: string | null
  metrics: SleepContextMetrics
}

export interface SleepContextPlan {
  risingTime: string
  thresholdTime: string
  windowMinutes: number
  status: string
}

export interface SleepContextAlignmentNight {
  nightDate: string
  alignedRise: boolean | null
  alignedWindow: boolean | null
}

const RESTFULNESS_LABELS = ['not at all', 'a little', 'somewhat', 'mostly', 'fully rested'] as const
const QUALITY_LABELS = ['very poor', 'poor', 'fair', 'good', 'very good'] as const

export function formatSleepContext(input: {
  nights: SleepContextNight[]
  plan: SleepContextPlan | null
  alignmentNights: SleepContextAlignmentNight[]
}): string {
  const lines = ['User sleep context (facts only). Use only these numbers.']
  if (input.nights.length === 0) {
    lines.push('No nights recorded yet.')
    appendPlan(lines, input.plan)
    return lines.join('\n')
  }

  const averages = averageNightMetrics(input.nights)
  lines.push(`Nights in this review: ${averages.nightsCounted}`)
  lines.push(
    'Per-night averages for this review. Quote these as a typical night. Never add minutes across nights.',
  )
  lines.push(`Average sleep per night: ${formatMinsLabel(averages.totalSleepMins)}`)
  lines.push(`Average time in bed per night: ${formatMinsLabel(averages.timeInBedMins)}`)
  lines.push(`Average sleep efficiency per night: ${formatPctLabel(averages.sleepEfficiencyPct)}`)
  lines.push(
    `Average time to fall asleep per night: ${formatMinsLabel(averages.sleepOnsetLatencyMins)}`,
  )
  lines.push(`Average WASO per night: ${formatMinsLabel(averages.wasoMins)}`)
  lines.push(`Average REM per night: ${formatMinsLabel(averages.remMins)}`)
  lines.push(`Average deep sleep per night: ${formatMinsLabel(averages.deepMins)}`)
  lines.push(`Average core sleep per night: ${formatMinsLabel(averages.coreMins)}`)

  const latest = input.nights[0]
  if (latest !== undefined) {
    lines.push(`Most recent night: ${formatNightLine(latest, input.alignmentNights)}`)
    appendDiaryDetails(lines, latest)
  }

  const older = input.nights.slice(1, 14)
  for (const night of older) {
    lines.push(`Night ${formatNightLine(night, input.alignmentNights)}`)
    appendDiaryDetails(lines, night)
  }

  appendPlan(lines, input.plan)
  return lines.join('\n')
}

function formatNightLine(
  night: SleepContextNight,
  alignmentNights: SleepContextAlignmentNight[],
): string {
  const parts = [
    night.nightDate,
    `TST ${night.metrics.totalSleepMins}`,
    `TIB ${night.metrics.timeInBedMins}`,
    `SE ${night.metrics.sleepEfficiencyPct}`,
    `SOL ${night.metrics.sleepOnsetLatencyMins}`,
    `WASO ${night.metrics.wasoMins}`,
  ]
  pushIfPresent(parts, 'bed', night.bedTime)
  pushIfPresent(parts, 'lights out', night.lightsOutTime)
  pushIfPresent(parts, 'wake', night.finalWakeTime)
  pushIfPresent(parts, 'out of bed', night.outOfBedTime)
  pushIfPresent(parts, 'awakenings', night.awakeningsCount)
  pushIfPresent(parts, 'EMA', night.metrics.earlyMorningAwakeMins)
  const stages = formatStages(night.metrics)
  if (stages !== null) {
    parts.push(stages)
  }
  parts.push(`source ${night.source}`)
  const alignment = alignmentFor(night.nightDate, alignmentNights)
  if (alignment !== null) {
    parts.push(`rise aligned ${triState(alignment.alignedRise)}`)
    parts.push(`window aligned ${triState(alignment.alignedWindow)}`)
  }
  return parts.join(', ')
}

function alignmentFor(
  nightDate: string,
  alignmentNights: SleepContextAlignmentNight[],
): SleepContextAlignmentNight | null {
  for (const row of alignmentNights) {
    if (row.nightDate === nightDate) {
      return row
    }
  }
  return null
}

function appendDiaryDetails(lines: string[], night: SleepContextNight): void {
  const restfulness = ratingLabel(RESTFULNESS_LABELS, night.restfulnessRating)
  if (restfulness !== null) {
    lines.push(`Diary ${night.nightDate} restfulness: ${restfulness}`)
  }
  const quality = ratingLabel(QUALITY_LABELS, night.sleepQualityRating)
  if (quality !== null) {
    lines.push(`Diary ${night.nightDate} quality: ${quality}`)
  }
  if (night.factors.length > 0) {
    lines.push(`Diary ${night.nightDate} factors: ${night.factors.join(', ')}`)
  }
  if (night.alcoholUnits !== null) {
    lines.push(`Diary ${night.nightDate} alcohol units: ${night.alcoholUnits}`)
  }
  if (night.sleepMedicationTaken === true) {
    const name = night.sleepMedicationName ?? 'unspecified'
    lines.push(`Diary ${night.nightDate} sleep medication: ${name}`)
  }
  if (night.sleepMedicationTaken === false) {
    lines.push(`Diary ${night.nightDate} sleep medication: none`)
  }
  if (night.notes !== null && night.notes.trim().length > 0) {
    lines.push(`Diary note ${night.nightDate}: ${night.notes.trim().slice(0, 280)}`)
  }
}

function appendPlan(lines: string[], plan: SleepContextPlan | null): void {
  if (plan === null) {
    lines.push('Sleep plan: none active.')
    return
  }
  lines.push(
    `Sleep plan: rise ${plan.risingTime}, threshold ${plan.thresholdTime}, window ${plan.windowMinutes} mins, status ${plan.status}`,
  )
}

function formatStages(metrics: SleepContextMetrics): string | null {
  const parts: string[] = []
  pushIfPresent(parts, 'core', metrics.coreMins)
  pushIfPresent(parts, 'deep', metrics.deepMins)
  pushIfPresent(parts, 'rem', metrics.remMins)
  if (parts.length === 0) {
    return null
  }
  return `stages ${parts.join(', ')}`
}

function pushIfPresent(parts: string[], label: string, value: string | number | null): void {
  if (value === null) {
    return
  }
  if (typeof value === 'string' && value.length === 0) {
    return
  }
  parts.push(`${label} ${value}`)
}

function ratingLabel(labels: readonly string[], value: number | null): string | null {
  if (value === null || value < 0 || value >= labels.length) {
    return null
  }
  return labels[value] ?? null
}

function triState(value: boolean | null): string {
  if (value === null) {
    return 'unknown'
  }
  if (value) {
    return 'yes'
  }
  return 'no'
}

export interface PeriodAverages {
  totalSleepMins: number | null
  timeInBedMins: number | null
  sleepEfficiencyPct: number | null
  sleepOnsetLatencyMins: number | null
  wasoMins: number | null
  coreMins: number | null
  deepMins: number | null
  remMins: number | null
  nightsCounted: number
}

export function averageNightMetrics(
  nights: Array<{ metrics: SleepContextMetrics }>,
): PeriodAverages {
  return {
    totalSleepMins: mean(nights.map((night) => night.metrics.totalSleepMins)),
    timeInBedMins: mean(nights.map((night) => night.metrics.timeInBedMins)),
    sleepEfficiencyPct: mean(nights.map((night) => night.metrics.sleepEfficiencyPct)),
    sleepOnsetLatencyMins: mean(nights.map((night) => night.metrics.sleepOnsetLatencyMins)),
    wasoMins: mean(nights.map((night) => night.metrics.wasoMins)),
    coreMins: mean(nights.map((night) => night.metrics.coreMins)),
    deepMins: mean(nights.map((night) => night.metrics.deepMins)),
    remMins: mean(nights.map((night) => night.metrics.remMins)),
    nightsCounted: nights.length,
  }
}

function formatMinsLabel(value: number | null): string {
  if (value === null) {
    return 'unknown'
  }
  const hours = Math.floor(value / 60)
  const mins = Math.round(value % 60)
  if (hours === 0) {
    return `${mins}m`
  }
  if (mins === 0) {
    return `${hours}h`
  }
  return `${hours}h ${mins}m`
}

function formatPctLabel(value: number | null): string {
  if (value === null) {
    return 'unknown'
  }
  return `${Math.round(value)}%`
}

function mean(values: Array<number | null>): number | null {
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
