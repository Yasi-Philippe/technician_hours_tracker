/**
 * Hours arithmetic.
 *
 * The technician types a start and an end time and nothing else. Overtime falls out of
 * those two numbers, so there is no third field to get wrong and no way for the parts
 * to disagree with the total.
 */

export const MINUTES_PER_DAY = 1440

export interface Hours {
  /** End minus start, crossing midnight if needed. */
  totalMinutes: number
  /** Up to the contractual day. */
  normalMinutes: number
  /** Everything past the contractual day. */
  extraMinutes: number
}

/**
 * Split a shift into normal and overtime minutes.
 *
 * A shift ending before it starts is read as crossing midnight, which is what a night
 * callout looks like. An `override` replaces the computed overtime and is subtracted
 * from the normal hours so the two still add up to the total.
 */
export function computeHours(
  startMinutes: number,
  endMinutes: number,
  contractualDailyMinutes: number,
  override: number | null = null,
): Hours {
  const raw = endMinutes - startMinutes
  const totalMinutes = raw < 0 ? raw + MINUTES_PER_DAY : raw

  if (override !== null) {
    const extraMinutes = clamp(override, 0, totalMinutes)
    return { totalMinutes, normalMinutes: totalMinutes - extraMinutes, extraMinutes }
  }

  const normalMinutes = Math.min(totalMinutes, contractualDailyMinutes)
  return { totalMinutes, normalMinutes, extraMinutes: totalMinutes - normalMinutes }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Minutes since midnight, wrapped into a single day. */
export function wrapMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/** 450 -> "07:30" */
export function formatClock(minutes: number): string {
  const m = wrapMinutes(Math.round(minutes))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** 450 -> "7h 30" — for durations, where a leading zero reads oddly. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${pad(m)}`
}

/** 450 -> 7.5, the form payroll spreadsheets expect. */
export function toDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

/** "07:30" -> 450. Tolerant of "7.30", "7,30", "730" and "7". */
export function parseClock(input: string): number | null {
  const cleaned = input.trim().replace(/[.,;]/g, ':')
  if (cleaned === '') return null

  const withSep = /^(\d{1,2}):(\d{1,2})$/.exec(cleaned)
  if (withSep) return toMinutes(Number(withSep[1]), Number(withSep[2]))

  const digitsOnly = /^(\d{1,4})$/.exec(cleaned)
  if (digitsOnly) {
    const digits = digitsOnly[1]!
    if (digits.length <= 2) return toMinutes(Number(digits), 0)
    const split = digits.length === 3 ? 1 : 2
    return toMinutes(Number(digits.slice(0, split)), Number(digits.slice(split)))
  }
  return null
}

function toMinutes(hours: number, minutes: number): number | null {
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Step a time to the next round increment.
 *
 * Nudging 07:05 forward by 15 lands on 07:15, not 07:20 — snapping to the grid is what
 * someone means when they tap "+" on a clock.
 */
export function stepClock(minutes: number, step: number): number {
  const snapped = step > 0 ? Math.floor(minutes / step) * step : Math.ceil(minutes / -step) * -step
  return wrapMinutes(snapped + step)
}
