/**
 * Public holidays in Italy and Spain.
 *
 * The work happens in Italy, so Italian holidays are non-working days and are marked as
 * such. The crew is Spanish and the contract spans both countries, so Spanish holidays
 * are worth knowing about — a colleague or an office may be unreachable — but they are
 * ordinary working days here and are never coloured as anything else.
 *
 * National holidays only. Regional and patron-saint days differ town by town and would be
 * wrong more often than right; a pack-supplied list could be added later if it matters.
 */

import type { ISODate } from './dates'

export type Country = 'IT' | 'ES'

export interface Holiday {
  name: string
  country: Country
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm.
 *
 * Needed because several holidays in both countries are pinned to it rather than to a
 * calendar date, and getting them wrong would mis-mark a day every single year.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function iso(year: number, month: number, day: number): ISODate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `offset` days from Easter Sunday, as an ISO date. */
function fromEaster(year: number, offset: number): ISODate {
  const { month, day } = easterSunday(year)
  const date = new Date(year, month - 1, day + offset)
  return iso(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Names stay in their own language: these are proper nouns, not interface text. */
function buildItaly(year: number): Map<ISODate, string> {
  return new Map([
    [iso(year, 1, 1), 'Capodanno'],
    [iso(year, 1, 6), 'Epifania'],
    [fromEaster(year, 1), 'Lunedì dell’Angelo'],
    [iso(year, 4, 25), 'Festa della Liberazione'],
    [iso(year, 5, 1), 'Festa del Lavoro'],
    [iso(year, 6, 2), 'Festa della Repubblica'],
    [iso(year, 8, 15), 'Ferragosto'],
    [iso(year, 11, 1), 'Ognissanti'],
    [iso(year, 12, 8), 'Immacolata Concezione'],
    [iso(year, 12, 25), 'Natale'],
    [iso(year, 12, 26), 'Santo Stefano'],
  ])
}

function buildSpain(year: number): Map<ISODate, string> {
  return new Map([
    [iso(year, 1, 1), 'Año Nuevo'],
    [iso(year, 1, 6), 'Epifanía del Señor'],
    [fromEaster(year, -2), 'Viernes Santo'],
    [iso(year, 5, 1), 'Fiesta del Trabajo'],
    [iso(year, 8, 15), 'Asunción de la Virgen'],
    [iso(year, 10, 12), 'Fiesta Nacional de España'],
    [iso(year, 11, 1), 'Todos los Santos'],
    [iso(year, 12, 6), 'Día de la Constitución'],
    [iso(year, 12, 8), 'Inmaculada Concepción'],
    [iso(year, 12, 25), 'Natividad del Señor'],
  ])
}

// Built once per year and kept: a month grid asks about 42 dates every render.
const cache = new Map<string, Map<ISODate, string>>()

function forYear(country: Country, year: number): Map<ISODate, string> {
  const key = `${country}${year}`
  let table = cache.get(key)
  if (!table) {
    table = country === 'IT' ? buildItaly(year) : buildSpain(year)
    cache.set(key, table)
  }
  return table
}

function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4))
}

export function italianHoliday(date: ISODate): string | undefined {
  return forYear('IT', yearOf(date)).get(date)
}

export function spanishHoliday(date: ISODate): string | undefined {
  return forYear('ES', yearOf(date)).get(date)
}

/** Every holiday falling on a date, in either country. */
export function holidaysOn(date: ISODate): Holiday[] {
  const found: Holiday[] = []
  const it = italianHoliday(date)
  const es = spanishHoliday(date)
  if (it) found.push({ name: it, country: 'IT' })
  if (es) found.push({ name: es, country: 'ES' })
  return found
}

/**
 * Whether the day is one nobody is expected to be on site: a weekend, or an Italian
 * public holiday. Spanish holidays are ordinary working days here.
 */
export function isNonWorkingDay(date: ISODate): boolean {
  const day = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  ).getDay()
  return day === 0 || day === 6 || italianHoliday(date) !== undefined
}
