/**
 * Jumping to any month of any year.
 *
 * Stepping back a month at a time is fine for last week and useless for last March.
 * Two taps get anywhere: pick the year, pick the month.
 *
 * Years are offered from the first entry the technician ever recorded up to the current
 * one, so the list is exactly as long as their history and never offers empty years.
 */

import { useState } from 'react'
import type { Language } from '../types'
import type { Strings } from '../i18n'
import { Sheet } from './ui'
import { fromISODate, monthNames, toISODate } from '../lib/dates'

export function MonthPicker({
  anchor,
  earliest,
  language,
  t,
  onPick,
  onClose,
}: {
  anchor: string
  /** Date of the oldest entry, or today when there are none. */
  earliest: string
  language: Language
  t: Strings
  onPick: (date: string) => void
  onClose: () => void
}) {
  const current = fromISODate(anchor)
  const [year, setYear] = useState(current.getFullYear())

  const firstYear = fromISODate(earliest).getFullYear()
  const lastYear = new Date().getFullYear()
  // Always include the year being viewed, even if it sits outside the recorded range.
  const from = Math.min(firstYear, year, lastYear)
  const to = Math.max(lastYear, year)
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i).reverse()

  const months = monthNames(language)

  return (
    <Sheet
      title={t.jumpTo}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-lg" onClick={onClose}>
          {t.close}
        </button>
      }
    >
      {years.length > 1 ? (
        <>
          <span className="field-label">{t.year}</span>
          <div className="chips" style={{ marginBottom: 20 }}>
            {years.map((option) => (
              <button
                key={option}
                type="button"
                className={`chip${option === year ? ' is-selected' : ''}`}
                onClick={() => setYear(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <span className="field-label">{t.month}</span>
      <div className="options cols-2">
        {months.map((label, index) => {
          const isCurrent = year === current.getFullYear() && index === current.getMonth()
          return (
            <button
              key={label}
              type="button"
              className={`option${isCurrent ? ' is-selected' : ''}`}
              style={{ textTransform: 'capitalize' }}
              onClick={() => {
                onPick(toISODate(new Date(year, index, 1)))
                onClose()
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
