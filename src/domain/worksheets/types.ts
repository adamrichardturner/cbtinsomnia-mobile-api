export const FIELD_TYPES = [
  'text',
  'longtext',
  'select',
  'multiselect',
  'boolean',
  'scale',
  'slider',
  'time',
  'duration',
  'date',
  'number',
  'repeater',
  'ordered_list',
  'linked_entity',
  'readonly_derived',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export interface FieldOption {
  value: string
  label: string
}

export interface ScalePoint {
  value: number
  label: string
}

export interface FieldDefinition {
  key: string
  type: FieldType
  label: string
  helpText?: string | undefined
  required: boolean
  safetyRelevant: boolean
  aiVisible: boolean
  projected: boolean
  maxLength?: number | undefined
  options?: FieldOption[] | undefined
  allowOther?: boolean | undefined
  min?: number | undefined
  max?: number | undefined
  points?: ScalePoint[] | undefined
  unit?: string | undefined
  fields?: FieldDefinition[] | undefined
  minItems?: number | undefined
  maxItems?: number | undefined
}

export interface FieldSchemaDocument {
  version: string
  fields: FieldDefinition[]
}

export type LicenceStatus = 'original' | 'licensed' | 'flagged'

export interface SeedDefinition {
  slug: string
  title: string
  purpose: string
  chapterReference: string | null
  repeatable: boolean
  fields: FieldDefinition[]
  instrumentKey?: string | null
  licenceStatus?: LicenceStatus
  featureFlagKey?: string | null
}

export type WorksheetResponses = Record<string, unknown>
