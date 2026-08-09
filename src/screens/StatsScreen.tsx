/**
 * What the hours add up to.
 *
 * Built around one question — how much have I worked, and how much of it was overtime —
 * asked over a week, a month or a year. The hero figure answers it before any chart is
 * read; the charts are there for the shape of it.
 *
 * Every form here was picked from the data's job rather than for variety: a hero figure
 * for the headline, stat tiles for the supporting numbers, stacked columns for hours
 * over time, and magnitude bars for the splits. Colour is emphasis throughout — the
 * brand red marks overtime and nothing else, so it always means the same thing.
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Entry } from '../types'
import type { ScreenProps } from './shared'
import { Card, Empty } from '../components/ui'
import { HoursChart, type ChartPoint } from '../components/HoursChart'
import { computeHours, formatDuration } from '../lib/time'
import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  formatDayNumber,
  formatDayShort,
  formatLongDate,
  formatMonthYear,
  fromISODate,
  isoWeek,
  monthNames,
  startOfMonthISO,
  toISODate,
  weekDates,
} from '../lib/dates'

type Range = 'week' | 'month' | 'year'

interface Totals {
  totalMinutes: number
  extraMinutes: number
  dayCount: number
  longestMinutes: number
}

export default function StatsScreen({ settings, pack, t, selectedDate, onSelectDate }: ScreenProps) {
  const [range, setRange] = useState<Range>('month')
  const [showTable, setShowTable] = useState(false)

  const contractual = pack?.defaults.contractualDailyMinutes ?? 480

  const period = useMemo(() => bounds(range, selectedDate), [range, selectedDate])
  const previous = useMemo(() => bounds(range, shiftBack(range, selectedDate)), [range, selectedDate])

  const entries =
    useLiveQuery(
      async (): Promise<Entry[]> =>
        db.entries.where('date').between(period.from, period.to, true, true).toArray(),
      [period.from, period.to],
    ) ?? []

  const previousEntries =
    useLiveQuery(
      async (): Promise<Entry[]> =>
        db.entries.where('date').between(previous.from, previous.to, true, true).toArray(),
      [previous.from, previous.to],
    ) ?? []

  const byDate = useMemo(() => minutesByDate(entries, contractual), [entries, contractual])
  const totals = useMemo(() => summarise(byDate), [byDate])
  const previousTotals = useMemo(
    () => summarise(minutesByDate(previousEntries, contractual)),
    [previousEntries, contractual],
  )

  const points = useMemo(
    () => buildPoints(range, selectedDate, byDate, settings.language),
    [range, selectedDate, byDate, settings.language],
  )

  const byProject = useMemo(() => group(entries, (e) => e.project, contractual), [entries, contractual])
  const byType = useMemo(
    () => group(entries, (e) => e.interventionType, contractual),
    [entries, contractual],
  )

  const delta =
    previousTotals.totalMinutes > 0
      ? Math.round(
          ((totals.totalMinutes - previousTotals.totalMinutes) / previousTotals.totalMinutes) * 100,
        )
      : null

  const title =
    range === 'week'
      ? `${t.week} ${isoWeek(selectedDate)}`
      : range === 'month'
        ? formatMonthYear(selectedDate, settings.language)
        : String(fromISODate(selectedDate).getFullYear())

  const step = (direction: number) =>
    onSelectDate(
      range === 'week'
        ? addDaysISO(selectedDate, direction * 7)
        : addMonthsISO(selectedDate, direction * (range === 'month' ? 1 : 12)),
    )

  return (
    <div className="screen">
      <div className="topbar">
        <button type="button" className="topbar-action" onClick={() => step(-1)} aria-label="‹">
          ‹
        </button>
        <div className="topbar-heading" style={{ cursor: 'default' }}>
          <span className="topbar-title">{t.navStats}</span>
          <span className="topbar-sub">{title}</span>
        </div>
        <button type="button" className="topbar-action" onClick={() => step(1)} aria-label="›">
          ›
        </button>
      </div>

      <div className="screen-pad">
        <div className="options cols-4" style={{ marginBottom: 16 }}>
          {(['week', 'month', 'year'] as Range[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`option${range === option ? ' is-selected' : ''}`}
              aria-pressed={range === option}
              onClick={() => setRange(option)}
            >
              {option === 'week' ? t.modeWeek : option === 'month' ? t.modeMonth : t.rangeYear}
            </button>
          ))}
        </div>

        {totals.dayCount === 0 ? (
          <Empty title={t.noStatsYet} hint={t.noStatsYetHint} />
        ) : (
          <>
            {/* The headline. A hero figure, not a one-bar chart. */}
            <div className="hero">
              <div className="hero-value">{formatDuration(totals.totalMinutes)}</div>
              <div className="hero-label">{t.statsHours}</div>

              <div className="hero-split" aria-hidden="true">
                <span
                  className="hero-split-normal"
                  style={{
                    flexGrow: Math.max(totals.totalMinutes - totals.extraMinutes, 0),
                  }}
                />
                {totals.extraMinutes > 0 ? (
                  <span className="hero-split-extra" style={{ flexGrow: totals.extraMinutes }} />
                ) : null}
              </div>
              <div className="hero-legend">
                <span className="legend-key">
                  <span className="legend-swatch" />
                  {formatDuration(totals.totalMinutes - totals.extraMinutes)} {t.normalHours}
                </span>
                <span className="legend-key">
                  <span className="legend-swatch ot" />
                  {formatDuration(totals.extraMinutes)} {t.extraHours}
                </span>
              </div>

              <p className="hero-delta">
                {delta === null ? (
                  t.noPrevious
                ) : (
                  <>
                    <strong>
                      {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)}%
                    </strong>{' '}
                    {t.vsPrevious}
                  </>
                )}
              </p>
            </div>

            <div className="totals" style={{ marginTop: 14 }}>
              <div className="total">
                <div className="total-value">{totals.dayCount}</div>
                <div className="total-label">{t.daysWorked}</div>
              </div>
              <div className="total">
                <div className="total-value">
                  {formatDuration(Math.round(totals.totalMinutes / totals.dayCount))}
                </div>
                <div className="total-label">{t.averageDay}</div>
              </div>
              <div className="total">
                <div className="total-value">{formatDuration(totals.longestMinutes)}</div>
                <div className="total-label">{t.longestDay}</div>
              </div>
            </div>

            <Card title={t.hoursPerDay}>
              <HoursChart
                points={points}
                normalLabel={t.normalHours}
                extraLabel={t.extraHours}
                emptyLabel={t.noStatsYet}
              />

              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 8 }}
                aria-expanded={showTable}
                onClick={() => setShowTable(!showTable)}
              >
                {showTable ? t.hideNumbers : t.showNumbers}
              </button>

              {/* The table is the accessibility fallback for the chart: every value the
                  chart encodes, readable without colour or shape. */}
              {showTable ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.tableDay}</th>
                      <th>{t.tableTotal}</th>
                      <th>{t.extraHours}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points
                      .filter((point) => point.normalMinutes + point.extraMinutes > 0)
                      .map((point) => (
                        <tr key={point.key}>
                          <td>{point.fullLabel}</td>
                          <td>{formatDuration(point.normalMinutes + point.extraMinutes)}</td>
                          <td>{point.extraMinutes > 0 ? formatDuration(point.extraMinutes) : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : null}
            </Card>

            {byProject.length > 0 ? (
              <Card title={t.byProject}>
                <Breakdown rows={byProject} />
              </Card>
            ) : null}

            {byType.length > 0 ? (
              <Card title={t.byType}>
                <Breakdown rows={byType} />
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Magnitude, so one hue light→dark rather than a colour per row. The ramp is ordered by
 * size, which means the eye reads the ranking from the bars without a legend.
 */
function Breakdown({ rows }: { rows: { name: string; minutes: number }[] }) {
  const max = Math.max(...rows.map((row) => row.minutes), 1)
  const total = rows.reduce((sum, row) => sum + row.minutes, 0)

  return (
    <div>
      {rows.map((row, index) => (
        <div className="breakdown-row" key={row.name}>
          <span className="breakdown-name">{row.name}</span>
          <span className="breakdown-value">
            {formatDuration(row.minutes)}
            <span className="breakdown-share">
              {' '}
              {Math.round((row.minutes / total) * 100)}%
            </span>
          </span>
          <span className="meter">
            <span
              className="meter-fill"
              style={{
                width: `${(row.minutes / max) * 100}%`,
                background: `var(--ramp-${Math.min(index + 1, 5)})`,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shaping the data
// ---------------------------------------------------------------------------

function bounds(range: Range, anchor: string): { from: string; to: string } {
  if (range === 'week') {
    const days = weekDates(anchor)
    return { from: days[0]!, to: days[6]! }
  }
  if (range === 'month') {
    return { from: startOfMonthISO(anchor), to: endOfMonthISO(anchor) }
  }
  const year = fromISODate(anchor).getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

function shiftBack(range: Range, anchor: string): string {
  if (range === 'week') return addDaysISO(anchor, -7)
  return addMonthsISO(anchor, range === 'month' ? -1 : -12)
}

function minutesByDate(entries: Entry[], contractual: number): Map<string, Totals> {
  const map = new Map<string, Totals>()
  for (const entry of entries) {
    const hours = computeHours(
        entry.segments,
      contractual,
      entry.extraMinutesOverride,
    )
    const current = map.get(entry.date) ?? {
      totalMinutes: 0,
      extraMinutes: 0,
      dayCount: 1,
      longestMinutes: 0,
    }
    map.set(entry.date, {
      totalMinutes: current.totalMinutes + hours.totalMinutes,
      extraMinutes: current.extraMinutes + hours.extraMinutes,
      dayCount: 1,
      longestMinutes: 0,
    })
  }
  return map
}

function summarise(byDate: Map<string, Totals>): Totals {
  let totalMinutes = 0
  let extraMinutes = 0
  let longestMinutes = 0
  for (const value of byDate.values()) {
    totalMinutes += value.totalMinutes
    extraMinutes += value.extraMinutes
    longestMinutes = Math.max(longestMinutes, value.totalMinutes)
  }
  return { totalMinutes, extraMinutes, dayCount: byDate.size, longestMinutes }
}

function buildPoints(
  range: Range,
  anchor: string,
  byDate: Map<string, Totals>,
  language: ScreenProps['settings']['language'],
): ChartPoint[] {
  if (range === 'week') {
    return weekDates(anchor).map((date) => ({
      key: date,
      label: formatDayShort(date, language),
      fullLabel: formatLongDate(date, language),
      normalMinutes: (byDate.get(date)?.totalMinutes ?? 0) - (byDate.get(date)?.extraMinutes ?? 0),
      extraMinutes: byDate.get(date)?.extraMinutes ?? 0,
    }))
  }

  if (range === 'month') {
    const first = fromISODate(startOfMonthISO(anchor))
    const days = fromISODate(endOfMonthISO(anchor)).getDate()
    return Array.from({ length: days }, (_, i) => {
      const date = toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1))
      const totals = byDate.get(date)
      return {
        key: date,
        // A label under every column of a 31-day month is unreadable; every fifth
        // carries the axis and the readout names the rest.
        label: (i + 1) % 5 === 0 || i === 0 ? formatDayNumber(date) : '',
        fullLabel: formatLongDate(date, language),
        normalMinutes: (totals?.totalMinutes ?? 0) - (totals?.extraMinutes ?? 0),
        extraMinutes: totals?.extraMinutes ?? 0,
      }
    })
  }

  const year = fromISODate(anchor).getFullYear()
  const names = monthNames(language)
  const monthly = Array.from({ length: 12 }, () => ({ total: 0, extra: 0 }))
  for (const [date, totals] of byDate) {
    if (!date.startsWith(String(year))) continue
    const month = Number(date.slice(5, 7)) - 1
    monthly[month]!.total += totals.totalMinutes
    monthly[month]!.extra += totals.extraMinutes
  }
  return monthly.map((value, index) => ({
    key: `${year}-${index}`,
    label: names[index]!.slice(0, 1).toUpperCase(),
    fullLabel: `${names[index]!} ${year}`,
    normalMinutes: value.total - value.extra,
    extraMinutes: value.extra,
  }))
}

function group(entries: Entry[], key: (entry: Entry) => string, contractual: number) {
  const map = new Map<string, number>()
  for (const entry of entries) {
    const name = key(entry).trim()
    if (name === '') continue
    const { totalMinutes } = computeHours(
        entry.segments,
      contractual,
      entry.extraMinutesOverride,
    )
    map.set(name, (map.get(name) ?? 0) + totalMinutes)
  }
  return [...map.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
}
