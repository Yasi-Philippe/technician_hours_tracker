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
import { Empty, HoursSummary } from '../components/ui'
import { ExportSheet } from '../components/ExportSheet'
import { computeHours, formatDuration } from '../lib/time'
import {
  addDaysISO,
  formatDayNumber,
  formatDayShort,
  isoWeek,
  isWeekend,
  todayISO,
  weekDates,
} from '../lib/dates'

export default function WeekScreen({
  settings,
  pack,
  t,
  selectedDate,
  onSelectDate,
  onToast,
  onGoToDay,
}: ScreenProps & { onGoToDay: (date: string) => void }) {
  const [exporting, setExporting] = useState(false)

  const days = weekDates(selectedDate)
  const entries =
    useLiveQuery(
      () => db.entries.where('date').between(days[0]!, days[6]!, true, true).toArray(),
      [days[0], days[6]],
      undefined,
    ) ?? []

  const contractual = pack?.defaults.contractualDailyMinutes ?? 480

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startMinutes - b.startMinutes)
    return map
  }, [entries])

  const totals = useMemo(() => {
    let total = 0
    let extra = 0
    for (const entry of entries) {
      const hours = computeHours(
        entry.startMinutes,
        entry.endMinutes,
        contractual,
        entry.extraMinutesOverride,
      )
      total += hours.totalMinutes
      extra += hours.extraMinutes
    }
    return { total, extra, days: byDay.size }
  }, [entries, contractual, byDay])

  return (
    <div className="screen">
      <div className="topbar">
        <button
          type="button"
          className="topbar-action"
          onClick={() => onSelectDate(addDaysISO(selectedDate, -7))}
          aria-label={t.previousWeek}
        >
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <p className="topbar-title">{t.week}</p>
          <p className="topbar-sub">
            {isoWeek(selectedDate)} · {formatDayNumber(days[0]!)}–{formatDayNumber(days[6]!)}
          </p>
        </div>
        <button
          type="button"
          className="topbar-action"
          onClick={() => onSelectDate(addDaysISO(selectedDate, 7))}
          aria-label={t.nextWeek}
        >
          ›
        </button>
      </div>

      <div className="screen-pad">
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
              onOpen={() => onGoToDay(date)}
            />
          ))}
        </div>

        {entries.length === 0 ? (
          <Empty title={t.emptyWeek} hint={t.emptyWeekHint} />
        ) : null}

        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!pack || entries.length === 0}
            onClick={() => setExporting(true)}
          >
            {t.exportButton}
          </button>
          {!pack ? <p className="hint">{t.exportNeedsPack}</p> : null}
        </div>
      </div>

      {exporting && pack ? (
        <ExportSheet
          pack={pack}
          settings={settings}
          t={t}
          entries={entries}
          anchorDate={selectedDate}
          onToast={onToast}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </div>
  )
}

function DayRow({
  date,
  entries,
  contractual,
  language,
  missingLabel,
  extraLabel,
  onOpen,
}: {
  date: string
  entries: Entry[]
  contractual: number
  language: ScreenProps['settings']['language']
  missingLabel: string
  extraLabel: string
  onOpen: () => void
}) {
  let total = 0
  let extra = 0
  for (const entry of entries) {
    const hours = computeHours(
      entry.startMinutes,
      entry.endMinutes,
      contractual,
      entry.extraMinutesOverride,
    )
    total += hours.totalMinutes
    extra += hours.extraMinutes
  }

  const empty = entries.length === 0
  const classes = [
    'dayrow',
    empty ? 'is-empty' : '',
    date === todayISO() ? 'is-today' : '',
    isWeekend(date) ? 'is-weekend' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} onClick={onOpen}>
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
            <span className="dayrow-sub">
              {entries
                .map((e) => e.description || e.interventionType)
                .filter(Boolean)
                .join(' — ')}
            </span>
          </>
        )}
      </span>
      {!empty ? (
        <span className="dayrow-hours">
          <HoursSummary totalMinutes={total} extraMinutes={extra} extraLabel={extraLabel} />
        </span>
      ) : null}
    </button>
  )
}
