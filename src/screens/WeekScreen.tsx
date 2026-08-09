/**
 * The whole week on one screen.
 *
 * Two jobs: spot the day you forgot, and produce the file. Missing days are shown as
 * missing rather than skipped, because a gap you cannot see is a gap you will not fill.
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Entry } from '../types'
import type { ScreenProps } from './shared'
import { Empty, HoursSummary, Sheet } from '../components/ui'
import { ExportSheet } from '../components/ExportSheet'
import { PackRequired } from '../components/PackRequired'
import { MonthGrid, type DayTotals } from '../components/MonthGrid'
import { DayEntries } from '../components/DayEntries'
import { HolidayNotice } from './DayScreen'
import { MonthPicker } from '../components/MonthPicker'
import { computeHours, formatDuration } from '../lib/time'
import { isNonWorkingDay } from '../lib/holidays'
import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  formatDayNumber,
  formatDayShort,
  formatLongDate,
  formatMonthYear,
  isoWeek,
  startOfMonthISO,
  todayISO,
  weekDates,
} from '../lib/dates'

type Mode = 'week' | 'month'

export default function WeekScreen({
  settings,
  pack,
  t,
  selectedDate,
  onSelectDate,
  onUpdateSettings,
  onToast,
}: ScreenProps) {
  // Which day is open below the calendar. Selecting a date used to switch tabs, which
  // threw away the month the technician was looking at.
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [needsPack, setNeedsPack] = useState(false)
  const [mode, setMode] = useState<Mode>('week')
  const [jumping, setJumping] = useState(false)

  const days = weekDates(selectedDate)
  const entries =
    useLiveQuery(
      () => db.entries.where('date').between(days[0]!, days[6]!, true, true).toArray(),
      [days[0], days[6]],
      undefined,
    ) ?? []

  const contractual = pack?.defaults.contractualDailyMinutes ?? 480

  // The grid shows whole weeks, so it spills a few days past the month at both ends.
  const monthFrom = addDaysISO(startOfMonthISO(selectedDate), -7)
  const monthTo = addDaysISO(endOfMonthISO(selectedDate), 7)
  // Only queried in month mode: no reason to read five weeks of entries to draw a week.
  const monthEntries =
    useLiveQuery(
      async (): Promise<Entry[]> =>
        mode === 'month'
          ? db.entries.where('date').between(monthFrom, monthTo, true, true).toArray()
          : [],
      [mode, monthFrom, monthTo],
    ) ?? []

  const earliest =
    useLiveQuery(async () => (await db.entries.orderBy('date').first())?.date ?? todayISO(), [], null)

  const totalsByDate = useMemo(() => {
    const map = new Map<string, DayTotals>()
    for (const entry of monthEntries) {
      const hours = computeHours(
        entry.segments,
        contractual,
        entry.extraMinutesOverride,
      )
      const current = map.get(entry.date) ?? { totalMinutes: 0, extraMinutes: 0 }
      map.set(entry.date, {
        totalMinutes: current.totalMinutes + hours.totalMinutes,
        extraMinutes: current.extraMinutes + hours.extraMinutes,
      })
    }
    return map
  }, [monthEntries, contractual])

  const monthTotals = useMemo(() => {
    let total = 0
    let extra = 0
    let days = 0
    for (const [date, value] of totalsByDate) {
      if (date < startOfMonthISO(selectedDate) || date > endOfMonthISO(selectedDate)) continue
      total += value.totalMinutes
      extra += value.extraMinutes
      days += 1
    }
    return { total, extra, days }
  }, [totalsByDate, selectedDate])

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    for (const list of map.values())
      list.sort((a, b) => (a.segments[0]?.startMinutes ?? 0) - (b.segments[0]?.startMinutes ?? 0))
    return map
  }, [entries])

  const totals = useMemo(() => {
    let total = 0
    let extra = 0
    for (const entry of entries) {
      const hours = computeHours(
        entry.segments,
        contractual,
        entry.extraMinutesOverride,
      )
      total += hours.totalMinutes
      extra += hours.extraMinutes
    }
    return { total, extra, days: byDay.size }
  }, [entries, contractual, byDay])

  const step = (delta: number) => {
    setOpenDay(null)
    onSelectDate(
      mode === 'week' ? addDaysISO(selectedDate, delta * 7) : addMonthsISO(selectedDate, delta),
    )
  }

  /** Open a day here rather than sending the technician to another screen. */
  const openDate = (date: string) => {
    onSelectDate(date)
    setOpenDay(date)
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button
          type="button"
          className="topbar-action"
          onClick={() => step(-1)}
          aria-label={mode === 'week' ? t.previousWeek : t.previousMonth}
        >
          ‹
        </button>
        {/* The title is a button in month mode: stepping one month at a time is fine for
            last month and useless for last March. */}
        <button
          type="button"
          className="topbar-heading"
          disabled={mode === 'week'}
          onClick={() => setJumping(true)}
        >
          <span className="topbar-title">{mode === 'week' ? t.week : t.jumpTo}</span>
          <span className="topbar-sub">
            {mode === 'week'
              ? `${isoWeek(selectedDate)} · ${formatDayNumber(days[0]!)}–${formatDayNumber(days[6]!)}`
              : formatMonthYear(selectedDate, settings.language)}
          </span>
        </button>
        <button
          type="button"
          className="topbar-action"
          onClick={() => step(1)}
          aria-label={mode === 'week' ? t.nextWeek : t.nextMonth}
        >
          ›
        </button>
      </div>

      <div className="screen-pad">
        <div className="options cols-2" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`option${mode === 'week' ? ' is-selected' : ''}`}
            aria-pressed={mode === 'week'}
            onClick={() => setMode('week')}
          >
            {t.modeWeek}
          </button>
          <button
            type="button"
            className={`option${mode === 'month' ? ' is-selected' : ''}`}
            aria-pressed={mode === 'month'}
            onClick={() => setMode('month')}
          >
            {t.modeMonth}
          </button>
        </div>

        {mode === 'month' ? (
          <>
            <div className="totals" style={{ marginBottom: 14 }}>
              <div className="total">
                <div className="total-value">{formatDuration(monthTotals.total)}</div>
                <div className="total-label">{t.monthTotalHours}</div>
              </div>
              <div className="total">
                <div className={`total-value${monthTotals.extra > 0 ? ' accent' : ''}`}>
                  {formatDuration(monthTotals.extra)}
                </div>
                <div className="total-label">{t.extraHours}</div>
              </div>
              <div className="total">
                <div className="total-value">{monthTotals.days}</div>
                <div className="total-label">{t.daysWorked}</div>
              </div>
            </div>

            <MonthGrid
              anchor={selectedDate}
              selected={selectedDate}
              totalsByDate={totalsByDate}
              weekdayLabels={days.map((date) => formatDayShort(date, settings.language))}
              onSelect={openDate}
            />

            {monthTotals.days === 0 ? <p className="hint">{t.nothingThisMonth}</p> : null}
          </>
        ) : (
        <>
        <div className="totals">
          <div className="total">
            <div className="total-value">{formatDuration(totals.total)}</div>
            <div className="total-label">{t.weekTotal}</div>
          </div>
          <div className="total">
            <div className={`total-value${totals.extra > 0 ? ' accent' : ''}`}>
              {formatDuration(totals.extra)}
            </div>
            <div className="total-label">{t.extraHours}</div>
          </div>
          <div className="total">
            <div className="total-value">{totals.days}/7</div>
            <div className="total-label">{t.daysFilled}</div>
          </div>
        </div>

        <div className="rows" style={{ marginTop: 14 }}>
          {days.map((date) => (
            <DayRow
              key={date}
              date={date}
              entries={byDay.get(date) ?? []}
              contractual={contractual}
              language={settings.language}
              missingLabel={t.missingDay}
              extraLabel={t.extraShort}
              moreLabel={t.showMore}
              lessLabel={t.showLess}
              onOpen={() => openDate(date)}
            />
          ))}
        </div>

        {entries.length === 0 ? (
          <Empty title={t.emptyWeek} hint={t.emptyWeekHint} />
        ) : null}

        <div style={{ marginTop: 18 }}>
          {/* Enabled without a pack on purpose: tapping it explains what is missing and
              offers to load the file, which a greyed-out button cannot do. */}
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => (pack ? setExporting(true) : setNeedsPack(true))}
          >
            {t.exportButton}
          </button>
          {!pack ? <p className="hint">{t.exportNeedsPack}</p> : null}
        </div>
        </>
        )}
      </div>

      {/* Over the calendar, not under it: a panel below the fold means scrolling to find
          out what a tapped day contains, which is no answer at all. */}
      {openDay ? (
        <Sheet
          title={formatLongDate(openDay, settings.language)}
          onClose={() => setOpenDay(null)}
          footer={
            <button type="button" className="btn btn-lg" onClick={() => setOpenDay(null)}>
              {t.closeDay}
            </button>
          }
        >
          <HolidayNotice date={openDay} t={t} />
          <DayEntries
            date={openDay}
            settings={settings}
            pack={pack}
            t={t}
            onUpdateSettings={onUpdateSettings}
            onToast={onToast}
            compact
          />
        </Sheet>
      ) : null}

      {jumping ? (
        <MonthPicker
          anchor={selectedDate}
          earliest={earliest ?? todayISO()}
          language={settings.language}
          t={t}
          onPick={onSelectDate}
          onClose={() => setJumping(false)}
        />
      ) : null}

      {needsPack ? <PackRequired t={t} onClose={() => setNeedsPack(false)} /> : null}

      {exporting && pack ? (
        <ExportSheet
          pack={pack}
          settings={settings}
          t={t}
          anchorDate={selectedDate}
          onToast={onToast}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * Descriptions long enough to be clipped get an explicit way to read them.
 *
 * Roughly what fits on one line of a phone. Past this the row offers to open up rather
 * than quietly cutting the text off, which is the difference between "there is more"
 * and "that is all there is".
 */
const CLIPPED_AT = 60

function DayRow({
  date,
  entries,
  contractual,
  language,
  missingLabel,
  extraLabel,
  moreLabel,
  lessLabel,
  onOpen,
}: {
  date: string
  entries: Entry[]
  contractual: number
  language: ScreenProps['settings']['language']
  missingLabel: string
  extraLabel: string
  moreLabel: string
  lessLabel: string
  onOpen: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  let total = 0
  let extra = 0
  for (const entry of entries) {
    const hours = computeHours(
        entry.segments,
      contractual,
      entry.extraMinutesOverride,
    )
    total += hours.totalMinutes
    extra += hours.extraMinutes
  }

  const empty = entries.length === 0
  const descriptions = entries
    .map((entry) => entry.description.trim() || entry.interventionType)
    .filter(Boolean)
  const joined = descriptions.join(' — ')
  const clipped = joined.length > CLIPPED_AT

  const classes = [
    'dayrow',
    empty ? 'is-empty' : '',
    date === todayISO() ? 'is-today' : '',
    isNonWorkingDay(date) ? 'is-closed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {/* The row itself opens the day; expanding is a separate control beneath it, so
          neither swallows the other's tap. */}
      <button type="button" className="dayrow-open" onClick={onOpen}>
        <span className="dayrow-date">
          <span className="dayrow-dow">{formatDayShort(date, language)}</span>
          <span className="dayrow-num">{formatDayNumber(date)}</span>
        </span>
        <span className="dayrow-main">
          {empty ? (
            <span className="dayrow-title">{missingLabel}</span>
          ) : (
            <>
              <span className="dayrow-title">
                {[...new Set(entries.map((e) => e.project))].join(' · ')}
              </span>
              {expanded ? (
                <span className="dayrow-sub is-expanded">
                  {descriptions.map((description, index) => (
                    <span className="dayrow-line" key={index}>
                      {description}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="dayrow-sub">{joined}</span>
              )}
            </>
          )}
        </span>
        {!empty ? (
          <span className="dayrow-hours">
            <HoursSummary totalMinutes={total} extraMinutes={extra} extraLabel={extraLabel} />
          </span>
        ) : null}
      </button>

      {clipped ? (
        <button
          type="button"
          className="dayrow-more"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  )
}
