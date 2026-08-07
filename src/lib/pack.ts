/**
 * Company Pack encoding, decoding and validation.
 *
 * The pack is the only route by which company data enters the app. Everything arriving
 * through it is treated as untrusted input from a file picker: validated field by field,
 * with a message a technician could act on rather than a stack trace.
 */

import type { CompanyPack, CompanyPackFile, DurationFormat, Person, SheetMapping } from '../types'
import { COLUMN_KEYS } from '../types'
import { base64ToBytes } from './base64'

export const PACK_FORMAT_VERSION = 1

export class PackError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'PackError'
  }
}

const DURATION_FORMATS: DurationFormat[] = ['fraction', 'decimal', 'hhmm']

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new PackError(`"${field}" is missing or not text`)
  return value
}

function asOptionalString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PackError(`"${field}" is missing or not a number`)
  }
  return value
}

function asStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new PackError(`"${field}" must be a list`)
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

function asPeople(value: unknown, field: string): Person[] {
  if (!Array.isArray(value)) throw new PackError(`"${field}" must be a list`)
  return value
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({
      name: asOptionalString(v.name, '').trim(),
      email: asOptionalString(v.email, '').trim(),
    }))
    .filter((p) => p.name !== '')
}

function parseSheet(value: unknown): SheetMapping {
  if (typeof value !== 'object' || value === null) throw new PackError('"sheet" is missing')
  const raw = value as Record<string, unknown>

  const dataStartRow = asNumber(raw.dataStartRow, 'sheet.dataStartRow')
  if (dataStartRow < 1 || !Number.isInteger(dataStartRow)) {
    throw new PackError('"sheet.dataStartRow" must be a whole row number of 1 or more')
  }

  const columnsRaw = raw.columns
  if (typeof columnsRaw !== 'object' || columnsRaw === null) {
    throw new PackError('"sheet.columns" is missing')
  }
  const columns: SheetMapping['columns'] = {}
  for (const key of COLUMN_KEYS) {
    const column = (columnsRaw as Record<string, unknown>)[key]
    if (column === undefined || column === null) continue
    if (typeof column !== 'number' || !Number.isInteger(column) || column < 0) {
      throw new PackError(`"sheet.columns.${key}" must be a whole column number of 0 or more`)
    }
    columns[key] = column
  }
  if (Object.keys(columns).length === 0) {
    throw new PackError('"sheet.columns" does not map a single column')
  }

  const timeFormat = asOptionalString(raw.timeFormat, 'fraction') as DurationFormat
  const durationFormat = asOptionalString(raw.durationFormat, 'fraction') as DurationFormat
  for (const [name, format] of [
    ['timeFormat', timeFormat],
    ['durationFormat', durationFormat],
  ] as const) {
    if (!DURATION_FORMATS.includes(format)) {
      throw new PackError(`"sheet.${name}" must be one of: ${DURATION_FORMATS.join(', ')}`)
    }
  }

  const percentScale = raw.percentScale === 100 ? 100 : 1

  return {
    dataStartRow,
    columns,
    timeFormat,
    durationFormat,
    percentScale,
    uppercaseMonth: raw.uppercaseMonth !== false,
    emptySectionText: asOptionalString(raw.emptySectionText, 'N/A'),
  }
}

/** Parse and validate a pack file's contents. Throws `PackError` with a readable message. */
export function parsePack(json: unknown): CompanyPackFile {
  if (typeof json !== 'object' || json === null) {
    throw new PackError('This file is not a company file')
  }
  const raw = json as Record<string, unknown>

  if (raw.formatVersion !== PACK_FORMAT_VERSION) {
    throw new PackError(
      'This company file was made for a different version of the app',
      `Expected format ${PACK_FORMAT_VERSION}, found ${String(raw.formatVersion)}`,
    )
  }

  const templateBase64 = asString(raw.templateBase64, 'templateBase64')
  let templateBytes: Uint8Array
  try {
    templateBytes = base64ToBytes(templateBase64)
  } catch {
    throw new PackError('The template inside this company file is damaged')
  }
  // Every .xlsx is a ZIP, and every ZIP starts "PK".
  if (templateBytes.length < 4 || templateBytes[0] !== 0x50 || templateBytes[1] !== 0x4b) {
    throw new PackError('The template inside this company file is not a valid Excel file')
  }

  const constantsRaw = (raw.constants ?? {}) as Record<string, unknown>
  const listsRaw = (raw.lists ?? {}) as Record<string, unknown>
  const defaultsRaw = (raw.defaults ?? {}) as Record<string, unknown>

  const pack: CompanyPackFile = {
    formatVersion: PACK_FORMAT_VERSION,
    packVersion: asOptionalString(raw.packVersion, '1'),
    label: asOptionalString(raw.label, 'Company').trim() || 'Company',
    templateBase64,
    sheet: parseSheet(raw.sheet),
    constants: {
      impresa: asOptionalString(constantsRaw.impresa, ''),
      cliente: asOptionalString(constantsRaw.cliente, ''),
    },
    lists: {
      projects: asStringList(listsRaw.projects ?? [], 'lists.projects'),
      sections: asStringList(listsRaw.sections ?? [], 'lists.sections'),
      interventionTypes: asStringList(
        listsRaw.interventionTypes ?? [],
        'lists.interventionTypes',
      ),
      colleagues: asPeople(listsRaw.colleagues ?? [], 'lists.colleagues'),
    },
    defaults: {
      startMinutes: clampMinutes(defaultsRaw.startMinutes, 7 * 60),
      endMinutes: clampMinutes(defaultsRaw.endMinutes, 15 * 60),
      contractualDailyMinutes: clampMinutes(defaultsRaw.contractualDailyMinutes, 8 * 60, 1440),
    },
    emailDomain: asOptionalString(raw.emailDomain, ''),
    fileNamePattern: asOptionalString(raw.fileNamePattern, 'Report_S{week}_{year}_{name}'),
  }

  if (pack.lists.interventionTypes.length === 0) {
    throw new PackError('This company file lists no intervention types')
  }
  if (pack.lists.projects.length === 0) {
    throw new PackError('This company file lists no projects')
  }

  return pack
}

function clampMinutes(value: unknown, fallback: number, max = 1439): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), 0), max)
}

export function serialisePack(pack: CompanyPackFile): string {
  return JSON.stringify(pack, null, 2)
}

/** Strip the parts a technician never needs to see, for display in settings. */
export function describePack(pack: CompanyPack): string {
  return `${pack.label} · v${pack.packVersion}`
}

export function packTemplateBytes(pack: CompanyPack): Uint8Array {
  return base64ToBytes(pack.templateBase64)
}
