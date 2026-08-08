/**
 * Calendar helpers.
 *
 * Work days are calendar dates, not instants, so they are stored and passed around as
 * `YYYY-MM-DD` strings and only become `Date` objects at the edges. That sidesteps the
 * whole timezone and daylight-saving class of bugs: a shift on the 29th of March stays
 * on the 29th of March.
 */

import {
  addDays,
  addMonths,
  endOfISOWeek,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  isSameMonth,
  startOfISOWeek,
  startOfMonth,
  setISOWeek,
  setISOWeekYear,
} from 'date-fns'
import { it, es } from 'date-fns/locale'
import type { Language } from '../types'

export type ISODate = string

const LOCALES = { it, es } as const

export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parses as a *local* date, avoiding the UTC shift `new Date('2026-08-03')` applies. */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(iso), days))
}

/** The seven dates of the ISO week containing `iso`, Monday first. */
export function weekDates(iso: ISODate): ISODate[] {
  const monday = startOfISOWeek(fromISODate(iso))
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)))
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

export function addMonthsISO(iso: ISODate, months: number): ISODate {
  return toISODate(addMonths(fromISODate(iso), months))
}

export function startOfMonthISO(iso: ISODate): ISODate {
  return toISODate(startOfMonth(fromISODate(iso)))
}

export function endOfMonthISO(iso: ISODate): ISODate {
  return toISODate(endOfMonth(fromISODate(iso)))
}

export function isSameMonthISO(a: ISODate, b: ISODate): boolean {
  return isSameMonth(fromISODate(a), fromISODate(b))
}

/**
 * The month laid out as whole weeks, Monday first.
 *
 * Complete weeks on both ends, so every row is seven cells and the grid never has gaps
 * to reason about. The leading and trailing days belong to neighbouring months and are
 * shown faded — dropping them entirely would misalign the columns.
 */
export function monthMatrix(iso: ISODate): ISODate[][] {
  const first = startOfMonth(fromISODate(iso))
  const start = startOfISOWeek(first)
  const end = endOfISOWeek(endOfMonth(first))

  const weeks: ISODate[][] = []
  let cursor = start
  while (cursor <= end) {
    const week = Array.from({ length: 7 }, (_, i) => toISODate(addDays(cursor, i)))
    weeks.push(week)
    cursor = addDays(cursor, 7)
  }
  return weeks
}

/** Month names for a year, in the interface language. */
export function monthNames(language: Language): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    format(new Date(2000, i, 1), 'LLLL', { locale: LOCALES[language] }),
  )
}

export function isoWeek(iso: ISODate): number {
  return getISOWeek(fromISODate(iso))
}

export function isoWeekYear(iso: ISODate): number {
  return getISOWeekYear(fromISODate(iso))
}

/** The Monday of a given ISO week — used when picking a week to export. */
export function mondayOfWeek(year: number, week: number): ISODate {
  const anchor = setISOWeek(setISOWeekYear(new Date(year, 5, 15), year), week)
  return toISODate(startOfISOWeek(anchor))
}

/** Number of ISO weeks in a year: 52, or 53 when the year is long. */
export function weeksInISOYear(year: number): number {
  return getISOWeek(new Date(year, 11, 28))
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function formatDayName(iso: ISODate, language: Language): string {
  return format(fromISODate(iso), 'EEEE', { locale: LOCALES[language] })
}

export function formatDayShort(iso: ISODate, language: Language): string {
  return format(fromISODate(iso), 'EEEEE', { locale: LOCALES[language] }).toUpperCase()
}

export function formatDayNumber(iso: ISODate): string {
  return format(fromISODate(iso), 'd')
}

export function formatLongDate(iso: ISODate, language: Language): string {
  return format(fromISODate(iso), 'EEEE d MMMM yyyy', { locale: LOCALES[language] })
}

export function formatShortDate(iso: ISODate): string {
  return format(fromISODate(iso), 'dd/MM/yyyy')
}

export function formatMonthYear(iso: ISODate, language: Language): string {
  return format(fromISODate(iso), 'MMMM yyyy', { locale: LOCALES[language] })
}

/**
 * The month name as it must appear in the report.
 *
 * Always Italian, whatever language the interface is set to — the spreadsheet has one
 * audience and it is not the technician.
 */
export function reportMonthName(iso: ISODate, uppercase: boolean): string {
  const name = format(fromISODate(iso), 'MMMM', { locale: it })
  return uppercase ? name.toUpperCase() : name
}

export function isWeekend(iso: ISODate): boolean {
  const day = fromISODate(iso).getDay()
  return day === 0 || day === 6
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
