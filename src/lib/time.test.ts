import { describe, expect, it } from 'vitest'
import {
  computeHours,
  formatClock,
  formatDuration,
  parseClock,
  stepClock,
  toDecimalHours,
} from './time'
import { isoWeek, mondayOfWeek, reportMonthName, weekDates, weeksInISOYear } from './dates'

const EIGHT_HOURS = 8 * 60

describe('computeHours', () => {
  it('treats a standard day as all normal hours', () => {
    expect(computeHours(7 * 60, 15 * 60, EIGHT_HOURS)).toEqual({
      totalMinutes: 480,
      normalMinutes: 480,
      extraMinutes: 0,
    })
  })

  it('counts everything past the contractual day as overtime', () => {
    expect(computeHours(7 * 60, 17 * 60, EIGHT_HOURS)).toEqual({
      totalMinutes: 600,
      normalMinutes: 480,
      extraMinutes: 120,
    })
  })

  it('records a short day without inventing overtime', () => {
    expect(computeHours(8 * 60 + 30, 11 * 60, EIGHT_HOURS)).toEqual({
      totalMinutes: 150,
      normalMinutes: 150,
      extraMinutes: 0,
    })
  })

  it('reads an end before the start as a shift crossing midnight', () => {
    expect(computeHours(22 * 60, 6 * 60, EIGHT_HOURS)).toEqual({
      totalMinutes: 480,
      normalMinutes: 480,
      extraMinutes: 0,
    })
  })

  it('keeps the parts adding up to the total when overtime is overridden', () => {
    const hours = computeHours(7 * 60, 17 * 60, EIGHT_HOURS, 60)
    expect(hours).toEqual({ totalMinutes: 600, normalMinutes: 540, extraMinutes: 60 })
    expect(hours.normalMinutes + hours.extraMinutes).toBe(hours.totalMinutes)
  })

  it('never lets an override exceed the hours actually worked', () => {
    expect(computeHours(7 * 60, 15 * 60, EIGHT_HOURS, 999).extraMinutes).toBe(480)
    expect(computeHours(7 * 60, 15 * 60, EIGHT_HOURS, -5).extraMinutes).toBe(0)
  })
})

describe('reading what a technician types', () => {
  it.each([
    ['07:30', 450],
    ['7:30', 450],
    ['7.30', 450],
    ['7,30', 450],
    ['0730', 450],
    ['730', 450],
    ['7', 420],
    ['16:00', 960],
    ['  8:15  ', 495],
  ])('parses %s', (input, expected) => {
    expect(parseClock(input)).toBe(expected)
  })

  it.each(['', 'abc', '25:00', '7:75', '99:99'])('rejects %s', (input) => {
    expect(parseClock(input)).toBeNull()
  })
})

describe('formatting', () => {
  it('pads clock times', () => {
    expect(formatClock(450)).toBe('07:30')
    expect(formatClock(0)).toBe('00:00')
  })

  it('writes durations the way people say them', () => {
    expect(formatDuration(480)).toBe('8h')
    expect(formatDuration(450)).toBe('7h 30')
    expect(formatDuration(0)).toBe('0h')
  })

  it('converts to decimal hours for the spreadsheet', () => {
    expect(toDecimalHours(450)).toBe(7.5)
    expect(toDecimalHours(480)).toBe(8)
    expect(toDecimalHours(150)).toBe(2.5)
  })
})

describe('stepping a clock', () => {
  it('snaps to the grid rather than adding blindly', () => {
    expect(stepClock(7 * 60 + 5, 15)).toBe(7 * 60 + 15)
    expect(stepClock(7 * 60 + 5, -15)).toBe(7 * 60)
  })

  it('moves a whole step when already on the grid', () => {
    expect(stepClock(7 * 60, 15)).toBe(7 * 60 + 15)
    expect(stepClock(7 * 60, -15)).toBe(6 * 60 + 45)
  })

  it('wraps around midnight', () => {
    expect(stepClock(23 * 60 + 45, 15)).toBe(0)
    expect(stepClock(0, -15)).toBe(23 * 60 + 45)
  })
})

describe('weeks', () => {
  it('lists a week Monday first', () => {
    const days = weekDates('2026-08-07')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-08-03')
    expect(days[6]).toBe('2026-08-09')
  })

  it('resolves the Monday of a numbered week', () => {
    const monday = mondayOfWeek(2026, 32)
    expect(isoWeek(monday)).toBe(32)
    expect(monday).toBe('2026-08-03')
  })

  it('knows which years have 53 weeks', () => {
    expect(weeksInISOYear(2026)).toBe(53)
    expect(weeksInISOYear(2025)).toBe(52)
  })

  it('names months in Italian regardless of interface language', () => {
    expect(reportMonthName('2026-07-16', true)).toBe('LUGLIO')
    expect(reportMonthName('2026-08-03', true)).toBe('AGOSTO')
  })
})
