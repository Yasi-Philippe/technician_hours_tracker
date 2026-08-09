/**
 * The screen a technician opens every afternoon.
 *
 * Everything on it is aimed at one number: how many taps between opening the app and
 * having the day recorded. Today is already selected, the times are already right, the
 * project is the one from yesterday — so a standard day is Add, Save.
 *
 * The reports themselves live in `DayEntries`, shared with the calendar so a day can be
 * opened from either place through the same code.
 */

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ScreenProps } from './shared'
import { WeekStrip } from '../components/WeekStrip'
import { DayEntries } from '../components/DayEntries'
import { formatLongDate, todayISO, weekDates } from '../lib/dates'
import { holidaysOn } from '../lib/holidays'

export default function DayScreen({
  settings,
  pack,
  t,
  selectedDate,
  onSelectDate,
  onUpdateSettings,
  onToast,
}: ScreenProps) {
  const week = weekDates(selectedDate)
  const weekEntries =
    useLiveQuery(
      () => db.entries.where('date').between(week[0]!, week[6]!, true, true).toArray(),
      [week[0], week[6]],
      undefined,
    ) ?? []

  const filledDates = useMemo(
    () => new Set(weekEntries.map((entry) => entry.date)),
    [weekEntries],
  )

  const isToday = selectedDate === todayISO()

  return (
    <div className="screen">
      <div className="topbar">
        <div>
          <p className="topbar-title">{isToday ? t.today : t.navToday}</p>
          <p className="topbar-sub">{formatLongDate(selectedDate, settings.language)}</p>
        </div>
      </div>

      <WeekStrip
        anchor={selectedDate}
        selected={selectedDate}
        filledDates={filledDates}
        language={settings.language}
        onSelect={onSelectDate}
      />

      <div className="screen-pad">
        <HolidayNotice date={selectedDate} t={t} />
        <DayEntries
          date={selectedDate}
          settings={settings}
          pack={pack}
          t={t}
          onUpdateSettings={onUpdateSettings}
          onToast={onToast}
        />
      </div>
    </div>
  )
}

/**
 * Says when a day is a public holiday, and where.
 *
 * Italian holidays are days nobody is expected on site, and the calendar already marks
 * them. Spanish ones are ordinary working days here — but the crew is Spanish and the
 * contract spans both countries, so it is worth knowing that an office or a colleague
 * back home may be shut. Stated, never coloured.
 */
export function HolidayNotice({ date, t }: { date: string; t: ScreenProps['t'] }) {
  const holidays = holidaysOn(date)
  if (holidays.length === 0) return null

  return (
    <div className="notices">
      {holidays.map((holiday) => (
        <p
          key={holiday.country}
          className={`notice${holiday.country === 'IT' ? ' is-closed-day' : ''}`}
        >
          <span className="notice-label">
            {holiday.country === 'IT' ? t.holidayItaly : t.holidaySpain}
          </span>
          {holiday.name}
        </p>
      ))}
    </div>
  )
}
