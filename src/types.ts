/**
 * Domain types.
 *
 * Note what is *not* here: no company name, no client, no project names, no colleague
 * names, no template. Those are data, not code, and they arrive at runtime inside a
 * Company Pack. This file describes only the shape of a report.
 */

export type Language = 'it' | 'es'

export interface Person {
  name: string
  email: string
}

/**
 * One intervention, on one day, by one technician.
 *
 * Entries are deliberately self-contained — the technician is denormalised onto the
 * entry rather than referenced. That makes export, import and merging between devices
 * trivial, and means an imported entry still knows who did the work.
 */
export interface Entry {
  id: string
  /** Local calendar date, `YYYY-MM-DD`. Never a timestamp: a work day is not an instant. */
  date: string
  /** Minutes since local midnight. */
  startMinutes: number
  endMinutes: number
  /**
   * Overtime is normally derived from start and end. This holds a manual figure for
   * the days reality does not cooperate; `null` means "calculate it".
   */
  extraMinutesOverride: number | null
  project: string
  section: string
  interventionType: string
  /** 0–100. */
  statusPercent: number
  description: string
  technician: Person
  /** Colleagues present at the same intervention; each becomes its own row on export. */
  colleagues: Person[]
  createdAt: number
  updatedAt: number
}

/** The hand-typed additions to each pick list. */
export interface CustomValues {
  projects: string[]
  sections: string[]
  interventionTypes: string[]
}

/** Which remembered list a management control is operating on. */
export type CustomListKey = keyof CustomValues | 'colleagues'

export interface Settings {
  id: 'settings'
  technician: Person
  language: Language
  /** Last values used, so the next entry can default to them. */
  lastProject: string
  lastSection: string
  lastInterventionType: string
  lastStartMinutes: number
  lastEndMinutes: number
  /**
   * Values typed by hand rather than chosen from the pack, remembered so they can be
   * offered again. Kept separate from the pack's own lists: the pack is the company's
   * to change, these belong to the technician and only they can remove them.
   */
  customColleagues: Person[]
  customValues: CustomValues
  onboardingComplete: boolean
  lastBackupAt: number | null
}

// ---------------------------------------------------------------------------
// Company Pack
// ---------------------------------------------------------------------------

/** Every column the exporter knows how to fill. */
export type ColumnKey =
  | 'date'
  | 'month'
  | 'week'
  | 'project'
  | 'section'
  | 'interventionType'
  | 'statusPercent'
  | 'description'
  | 'impresa'
  | 'cliente'
  | 'technicianName'
  | 'technicianEmail'
  | 'startTime'
  | 'endTime'
  | 'totalHours'
  | 'normalHours'
  | 'extraHours'

export const COLUMN_KEYS: ColumnKey[] = [
  'date',
  'month',
  'week',
  'project',
  'section',
  'interventionType',
  'statusPercent',
  'description',
  'impresa',
  'cliente',
  'technicianName',
  'technicianEmail',
  'startTime',
  'endTime',
  'totalHours',
  'normalHours',
  'extraHours',
]

/**
 * How a value should be written into a column, because templates disagree.
 * `fraction` writes a day fraction (Excel's native clock time); `decimal` writes 7.5;
 * `hhmm` writes the text "7:30".
 */
export type DurationFormat = 'fraction' | 'decimal' | 'hhmm'

export interface SheetMapping {
  /** 1-based worksheet row where data begins. */
  dataStartRow: number
  /** Zero-based column index per field. Omit a key to leave that column alone. */
  columns: Partial<Record<ColumnKey, number>>
  /** How clock times are written — the start and end of the shift. */
  timeFormat: DurationFormat
  /**
   * How the total-hours column is written.
   *
   * Kept separate from `hoursFormat` because templates routinely format these columns
   * differently: a total sitting in a `h:mm:ss` cell needs a day fraction, while the
   * normal- and overtime-hours columns are usually plain `0.00` numbers. Writing a
   * fraction into a decimal cell silently shows `0.33` where `8.00` was meant.
   */
  totalFormat: DurationFormat
  /** How the normal-hours and overtime-hours columns are written. */
  hoursFormat: DurationFormat
  /** `1` for a template whose cell is formatted as a percentage, `100` for a plain number. */
  percentScale: 1 | 100
  /** Uppercase the Italian month name, as most templates do. */
  uppercaseMonth: boolean
  /** Text written when a section is not applicable. */
  emptySectionText: string
}

/**
 * Everything company-specific, supplied at runtime and stored only on the device.
 *
 * This is the boundary that keeps the repository clean: the app knows the shape of a
 * report, the pack supplies every real value.
 */
export interface CompanyPack {
  id: 'pack'
  formatVersion: 1
  /** Free-text version the company controls, e.g. "2026.08". */
  packVersion: string
  /** Shown in settings so a technician can confirm which pack they have. */
  label: string
  /** The .xlsx template, base64-encoded. */
  templateBase64: string
  sheet: SheetMapping
  constants: {
    impresa: string
    cliente: string
  }
  lists: {
    projects: string[]
    sections: string[]
    interventionTypes: string[]
    colleagues: Person[]
  }
  defaults: {
    startMinutes: number
    endMinutes: number
    /** Minutes beyond which the day counts as overtime. */
    contractualDailyMinutes: number
  }
  /** Appended when a technician types a bare username, e.g. "@example.com". */
  emailDomain: string
  /**
   * Exported filename. Placeholders: {week} {year} {name} {from} {to}
   */
  fileNamePattern: string
  installedAt: number
}

/** The Company Pack as it travels as a file — the stored record minus its database key. */
export type CompanyPackFile = Omit<CompanyPack, 'id' | 'installedAt'>

// ---------------------------------------------------------------------------
// Backup package
// ---------------------------------------------------------------------------

export interface BackupFile {
  kind: 'technician-hours-backup'
  formatVersion: 1
  exportedAt: number
  exportedBy: Person
  entries: Entry[]
  /** Carried so a new device is usable immediately after a single import. */
  pack: CompanyPackFile | null
}
