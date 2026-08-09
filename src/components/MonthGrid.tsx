/**
 * A month at a glance.
 *
 * The week strip answers "what did I do this week". This answers "what did I do in
 * March", and it is the only surface from which any day of any year is reachable without
 * stepping through the calendar a week at a time.
 *
 * Every cell that has work shows its hours. A month of grey numbers would be a calendar;
 * the hours are what makes it a record.
 */

import { formatDayNumber, isSameMonthISO, monthMatrix, todayISO } from '../lib/dates'
import { isNonWorkingDay, spanishHoliday } from '../lib/holidays'

export interface DayTotals {
  totalMinutes: number
  extraMinutes: number
}

export function MonthGrid({
  anchor,
  selected,
  totalsByDate,
  weekdayLabels,
  onSelect,
}: {
  anchor: string
  selected: string
  totalsByDate: Map<string, DayTotals>
  weekdayLabels: string[]
  onSelect: (date: string) => void
}) {
  const weeks = monthMatrix(anchor)
  const today = todayISO()

  return (
    <div className="month">
      <div className="month-head">
        {weekdayLabels.map((label, index) => (
          <span key={index} className={`month-dow${index >= 5 ? ' is-weekend' : ''}`}>
            {label}
          </span>
        ))}
      </div>

      <div className="month-grid">
        {weeks.flat().map((date) => {
          const totals = totalsByDate.get(date)
          const outside = !isSameMonthISO(date, anchor)
          const classes = [
            'month-cell',
            outside ? 'is-outside' : '',
            date === selected ? 'is-selected' : '',
            date === today ? 'is-today' : '',
            isNonWorkingDay(date) ? 'is-closed' : '',
            spanishHoliday(date) ? 'is-spanish-holiday' : '',
            totals ? 'has-work' : '',
            totals && totals.extraMinutes > 0 ? 'has-overtime' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={date}
              type="button"
              className={classes}
              aria-current={date === today ? 'date' : undefined}
              aria-label={`${date}${totals ? ` — ${round(totals.totalMinutes)}h` : ''}`}
              onClick={() => onSelect(date)}
            >
              <span className="month-num">{formatDayNumber(date)}</span>
              {totals ? <span className="month-hours">{round(totals.totalMinutes)}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Hours to one decimal, but without a pointless ".0" — the cell is 40px wide. */
function round(minutes: number): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}
