/**
 * Turning entries into the company spreadsheet.
 *
 * Which column holds what is not decided here — it comes from the pack's sheet mapping.
 * This module only knows the *meaning* of each field and how to render it in the units a
 * spreadsheet expects.
 */

import type { CompanyPack, Entry, Person } from '../types'
import { blank, dateToSerial, fillTemplate, num, text, type Cell, type Row } from './xlsx'
import { fromISODate, isoWeek, isoWeekYear, reportMonthName } from './dates'
import { computeHours, formatClock, toDecimalHours, MINUTES_PER_DAY } from './time'
import { packTemplateBytes } from './pack'

export interface ReportSummary {
  entryCount: number
  rowCount: number
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

/** One spreadsheet row: an entry as performed by one particular technician. */
interface ReportRow {
  entry: Entry
  technician: Person
}

function durationCell(minutes: number, format: CompanyPack['sheet']['durationFormat']): Cell {
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

function buildRow(row: ReportRow, pack: CompanyPack): Row {
  const { entry, technician } = row
  const { columns, percentScale, uppercaseMonth, emptySectionText } = pack.sheet
  const date = fromISODate(entry.date)
  const hours = computeHours(
    entry.startMinutes,
    entry.endMinutes,
    pack.defaults.contractualDailyMinutes,
    entry.extraMinutesOverride,
  )

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
  put('technicianName', text(technician.name))
  put('technicianEmail', text(technician.email))
  put('startTime', durationCell(entry.startMinutes, pack.sheet.timeFormat))
  put('endTime', durationCell(entry.endMinutes, pack.sheet.timeFormat))
  put('totalHours', durationCell(hours.totalMinutes, pack.sheet.durationFormat))
  put('normalHours', durationCell(hours.normalMinutes, pack.sheet.durationFormat))
  // An empty overtime cell reads better than a column of zeroes, and matches how these
  // sheets are filled by hand.
  put('extraHours', hours.extraMinutes > 0 ? durationCell(hours.extraMinutes, pack.sheet.durationFormat) : blank)

  return cells
}

/**
 * Expand entries into spreadsheet rows.
 *
 * A colleague who was present at an intervention gets their own row carrying the same
 * work and the same hours under their own name — which is how these reports have always
 * recorded two people on one job.
 */
export function expandRows(entries: Entry[], includeColleagues = true): ReportRow[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  )
  const rows: ReportRow[] = []
  for (const entry of sorted) {
    rows.push({ entry, technician: entry.technician })
    if (!includeColleagues) continue
    for (const colleague of entry.colleagues) {
      if (colleague.name.trim() === '') continue
      rows.push({ entry, technician: colleague })
    }
  }
  return rows
}

export function summarise(rows: ReportRow[], pack: CompanyPack): ReportSummary {
  const days = new Set<string>()
  const technicians = new Set<string>()
  const entries = new Set<string>()
  let totalMinutes = 0
  let extraMinutes = 0

  for (const row of rows) {
    days.add(row.entry.date)
    technicians.add(row.technician.name)
    const hours = computeHours(
      row.entry.startMinutes,
      row.entry.endMinutes,
      pack.defaults.contractualDailyMinutes,
      row.entry.extraMinutesOverride,
    )
    totalMinutes += hours.totalMinutes
    extraMinutes += hours.extraMinutes
    entries.add(row.entry.id)
  }

  return {
    entryCount: entries.size,
    rowCount: rows.length,
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
    .replace(/\{name\}/g, technicianName)
    .replace(/\{from\}/g, from)
    .replace(/\{to\}/g, to)
  return `${safeFileName(filled) || 'Report'}.xlsx`
}

export function buildReport(
  entries: Entry[],
  pack: CompanyPack,
  options: { anchorDate: string; technicianName: string; includeColleagues?: boolean },
): BuiltReport {
  const rows = expandRows(entries, options.includeColleagues ?? true)
  const summary = summarise(rows, pack)

  const dates = rows.map((r) => r.entry.date).sort()
  const bytes = fillTemplate(packTemplateBytes(pack), {
    dataStartRow: pack.sheet.dataStartRow,
    rows: rows.map((row) => buildRow(row, pack)),
  })

  return {
    bytes,
    filename: reportFileName(
      pack.fileNamePattern,
      options.anchorDate,
      options.technicianName,
      dates[0] ?? options.anchorDate,
      dates[dates.length - 1] ?? options.anchorDate,
    ),
    summary,
  }
}
