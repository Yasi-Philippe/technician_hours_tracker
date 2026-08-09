/**
 * Turning entries into the company spreadsheet.
 *
 * Which column holds what is not decided here — it comes from the pack's sheet mapping.
 * This module only knows the *meaning* of each field and how to render it in the units a
 * spreadsheet expects.
 */

import type { CompanyPack, DurationFormat, Entry, Person } from '../types'
import { blank, dateToSerial, fillTemplate, num, text, type Cell, type Row } from './xlsx'
import { fromISODate, isoWeek, isoWeekYear, reportMonthName } from './dates'
import { computeHours, formatClock, toDecimalHours, MINUTES_PER_DAY } from './time'
import { packTemplateBytes } from './pack'

export interface ReportSummary {
  entryCount: number
  dayCount: number
  technicians: string[]
  totalMinutes: number
  extraMinutes: number
}

export interface BuiltReport {
  bytes: Uint8Array
  filename: string
  summary: ReportSummary
}

/** Separates the names sharing one TECNICO cell. */
export const TECHNICIAN_SEPARATOR = '; '

/**
 * Everyone who worked an intervention: the technician who filed it, then any colleagues,
 * in the order they were added. Blank and duplicate names are dropped, so a slip while
 * typing cannot produce "Mario Rossi; Mario Rossi".
 */
export function crewOf(entry: Entry): Person[] {
  const crew: Person[] = []
  const seen = new Set<string>()
  for (const person of [entry.technician, ...entry.colleagues]) {
    const name = person.name.trim()
    if (name === '' || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    crew.push({ name, email: person.email })
  }
  return crew
}

function durationCell(minutes: number, format: DurationFormat): Cell {
  switch (format) {
    case 'decimal':
      return num(toDecimalHours(minutes))
    case 'hhmm':
      return text(formatClock(minutes))
    case 'fraction':
    default:
      return num(minutes / MINUTES_PER_DAY)
  }
}

function buildRow(entry: Entry, pack: CompanyPack): Row {
  const crew = crewOf(entry)
  const { columns, percentScale, uppercaseMonth, emptySectionText } = pack.sheet
  const date = fromISODate(entry.date)
  const hours = computeHours(
    entry.segments,
    pack.defaults.contractualDailyMinutes,
    entry.extraMinutesOverride,
  )
  // With a split day the sheet shows the span — first on site to last off — while the
  // total stays the hours actually worked. That is how a break has always read here.
  const firstStart = Math.min(...entry.segments.map((r) => r.startMinutes))
  const lastEnd = Math.max(...entry.segments.map((r) => r.endMinutes))

  const cells: Row = []
  const put = (key: keyof typeof columns, cell: Cell) => {
    const column = columns[key]
    if (column !== undefined) (cells as Cell[])[column] = cell
  }

  put('date', num(dateToSerial(date.getFullYear(), date.getMonth() + 1, date.getDate())))
  put('month', text(reportMonthName(entry.date, uppercaseMonth)))
  put('week', num(isoWeek(entry.date)))
  put('project', text(entry.project))
  put('section', text(entry.section.trim() || emptySectionText))
  put('interventionType', text(entry.interventionType))
  put('statusPercent', num(percentScale === 100 ? entry.statusPercent : entry.statusPercent / 100))
  put('description', text(entry.description))
  put('impresa', text(pack.constants.impresa))
  put('cliente', text(pack.constants.cliente))
  // Everyone who was there shares one row. A row per person would double the hours when
  // the sheet is totalled, which is exactly what the office must not see.
  put('technicianName', text(crew.map((person) => person.name).join(TECHNICIAN_SEPARATOR)))
  // The e-mail column identifies who filed the report, so it stays the author's alone.
  put('technicianEmail', text(entry.technician.email))
  put('startTime', durationCell(firstStart, pack.sheet.timeFormat))
  put('endTime', durationCell(lastEnd, pack.sheet.timeFormat))
  // Total is every hour worked, normal plus overtime.
  put('totalHours', durationCell(hours.totalMinutes, pack.sheet.totalFormat))
  // Normal hours stop at the contractual day; anything past it lands in overtime.
  put('normalHours', durationCell(hours.normalMinutes, pack.sheet.hoursFormat))
  // An empty overtime cell reads better than a column of zeroes, and matches how these
  // sheets are filled by hand.
  put(
    'extraHours',
    hours.extraMinutes > 0 ? durationCell(hours.extraMinutes, pack.sheet.hoursFormat) : blank,
  )

  return cells
}

/**
 * Order entries the way they will appear in the sheet: one row each, by date.
 *
 * One intervention is one row no matter how many people were on it. Giving each colleague
 * their own row would repeat the same hours under different names, and any total taken
 * down the ORE TOTALI column would come out at a multiple of the hours actually worked.
 */
export function reportRows(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

export function summarise(entries: Entry[], pack: CompanyPack): ReportSummary {
  const days = new Set<string>()
  const technicians = new Set<string>()
  let totalMinutes = 0
  let extraMinutes = 0

  for (const entry of entries) {
    days.add(entry.date)
    for (const person of crewOf(entry)) technicians.add(person.name)
    const hours = computeHours(
      entry.segments,
      pack.defaults.contractualDailyMinutes,
      entry.extraMinutesOverride,
    )
    totalMinutes += hours.totalMinutes
    extraMinutes += hours.extraMinutes
  }

  return {
    entryCount: entries.length,
    dayCount: days.size,
    technicians: [...technicians].sort(),
    totalMinutes,
    extraMinutes,
  }
}

/** Strip anything a file system or a mail client would object to. */
function safeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function reportFileName(
  pattern: string,
  anchorDate: string,
  technicianName: string,
  from: string,
  to: string,
): string {
  const filled = pattern
    .replace(/\{week\}/g, String(isoWeek(anchorDate)).padStart(2, '0'))
    .replace(/\{year\}/g, String(isoWeekYear(anchorDate)))
    .replace(/\{month\}/g, reportMonthName(anchorDate, true))
    .replace(/\{name\}/g, technicianName)
    .replace(/\{from\}/g, from)
    .replace(/\{to\}/g, to)
  return `${safeFileName(filled) || 'Report'}.xlsx`
}

/** How much history a report covers. */
export type ReportRange = 'week' | 'month' | 'all'

/**
 * The filename for a range.
 *
 * Only the weekly report follows the pack's pattern — that is the one the office receives
 * every week and expects to recognise. A month or a full history is an occasional export,
 * so it gets a name that says plainly what it is rather than a week number that would be
 * misleading.
 */
export function fileNameForRange(
  range: ReportRange,
  pack: CompanyPack,
  anchorDate: string,
  technicianName: string,
  from: string,
  to: string,
): string {
  const pattern =
    range === 'week'
      ? pack.fileNamePattern
      : range === 'month'
        ? 'Report_{month}_{year}_{name}'
        : 'Report_completo_{from}_{to}_{name}'
  return reportFileName(pattern, anchorDate, technicianName, from, to)
}

export function buildReport(
  entries: Entry[],
  pack: CompanyPack,
  options: { anchorDate: string; technicianName: string; range?: ReportRange },
): BuiltReport {
  const rows = reportRows(entries)
  const summary = summarise(rows, pack)

  const dates = rows.map((entry) => entry.date).sort()
  const bytes = fillTemplate(packTemplateBytes(pack), {
    dataStartRow: pack.sheet.dataStartRow,
    rows: rows.map((entry) => buildRow(entry, pack)),
  })

  return {
    bytes,
    filename: fileNameForRange(
      options.range ?? 'week',
      pack,
      options.anchorDate,
      options.technicianName,
      dates[0] ?? options.anchorDate,
      dates[dates.length - 1] ?? options.anchorDate,
    ),
    summary,
  }
}
