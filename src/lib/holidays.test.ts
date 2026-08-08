import { describe, expect, it } from 'vitest'
import {
  easterSunday,
  holidaysOn,
  isNonWorkingDay,
  italianHoliday,
  spanishHoliday,
} from './holidays'

describe('Easter', () => {
  // Checked against published dates: these drive every movable holiday in both countries.
  it.each([
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2030, 4, 21],
  ])('falls on the right day in %i', (year, month, day) => {
    expect(easterSunday(year)).toEqual({ month, day })
  })
})

describe('Italian holidays', () => {
  it('knows the fixed dates', () => {
    expect(italianHoliday('2026-01-01')).toBe('Capodanno')
    expect(italianHoliday('2026-04-25')).toBe('Festa della Liberazione')
    expect(italianHoliday('2026-08-15')).toBe('Ferragosto')
    expect(italianHoliday('2026-12-26')).toBe('Santo Stefano')
  })

  it('moves Easter Monday with Easter', () => {
    // Easter 2026 is 5 April, so Easter Monday is the 6th.
    expect(italianHoliday('2026-04-06')).toBe('Lunedì dell’Angelo')
    expect(italianHoliday('2025-04-21')).toBe('Lunedì dell’Angelo')
  })

  it('leaves ordinary days alone', () => {
    expect(italianHoliday('2026-08-12')).toBeUndefined()
    // 12 October is a holiday in Spain but a working day in Italy.
    expect(italianHoliday('2026-10-12')).toBeUndefined()
  })
})

describe('Spanish holidays', () => {
  it('knows the ones that differ from Italy', () => {
    expect(spanishHoliday('2026-10-12')).toBe('Fiesta Nacional de España')
    expect(spanishHoliday('2026-12-06')).toBe('Día de la Constitución')
    // Good Friday is a holiday in Spain but not in Italy.
    expect(spanishHoliday('2026-04-03')).toBe('Viernes Santo')
    expect(italianHoliday('2026-04-03')).toBeUndefined()
  })

  it('does not make a day non-working', () => {
    // A Monday that is a Spanish holiday only.
    expect(spanishHoliday('2026-10-12')).toBeDefined()
    expect(isNonWorkingDay('2026-10-12')).toBe(false)
  })
})

describe('non-working days', () => {
  it('counts weekends', () => {
    expect(isNonWorkingDay('2026-08-08')).toBe(true) // Saturday
    expect(isNonWorkingDay('2026-08-09')).toBe(true) // Sunday
    expect(isNonWorkingDay('2026-08-10')).toBe(false) // Monday
  })

  it('counts Italian holidays that fall midweek', () => {
    // 15 August 2026 is a Saturday, so take one that is not.
    expect(isNonWorkingDay('2026-06-02')).toBe(true) // Tuesday, Festa della Repubblica
    expect(isNonWorkingDay('2026-12-08')).toBe(true) // Tuesday, Immacolata
  })
})

describe('days that are holidays in both countries', () => {
  it('reports each country separately', () => {
    const both = holidaysOn('2026-01-06')
    expect(both.map((h) => h.country)).toEqual(['IT', 'ES'])
    expect(both[0]!.name).toBe('Epifania')
    expect(both[1]!.name).toBe('Epifanía del Señor')
  })

  it('reports nothing on an ordinary day', () => {
    expect(holidaysOn('2026-08-12')).toEqual([])
  })
})
