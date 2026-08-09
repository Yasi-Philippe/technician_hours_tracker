/**
 * The seven days of the current week, always visible above the day screen.
 *
 * It is navigation and status at once: a filled dot means that day already has a report,
 * so "did I forget Wednesday?" is answered without opening anything.
 */

import type { Language } from '../types'
import { formatDayNumber, formatDayShort, todayISO, weekDates } from '../lib/dates'
import { isNonWorkingDay } from '../lib/holidays'

export function WeekStrip({
  anchor,
  selected,
  filledDates,
  language,
  className = '',
  onSelect,
}: {
  anchor: string
  selected: string
  filledDates: Set<string>
  language: Language
  /** Extra class, so the strip can sit inside a sheet as well as under the top bar. */
  className?: string
  onSelect: (date: string) => void
}) {
  const today = todayISO()
  return (
    <div className={`weekstrip${className ? ` ${className}` : ''}`}>
      {weekDates(anchor).map((date) => {
        const classes = [
          'daychip',
          date === selected ? 'is-selected' : '',
          date === today ? 'is-today' : '',
          isNonWorkingDay(date) ? 'is-closed' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={date}
            type="button"
            className={classes}
            aria-pressed={date === selected}
            onClick={() => onSelect(date)}
          >
            <span className="daychip-letter">{formatDayShort(date, language)}</span>
            <span className="daychip-number">{formatDayNumber(date)}</span>
            <span className={`daychip-dot${filledDates.has(date) ? ' filled' : ''}`} />
          </button>
        )
      })}
    </div>
  )
}
