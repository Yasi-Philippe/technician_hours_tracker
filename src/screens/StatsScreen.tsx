/**
 * Totals and charts.
 *
 * Deliberately narrow. A technician wants to know two things — how much have I worked, and
 * how much of it was overtime — so the charts answer those and stop. Everything is drawn as
 * plain SVG: no chart library, no runtime, and full control over how it reads at 360px wide.
 */

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Entry } from '../types'
import type { ScreenProps } from './shared'
import { Card, Empty } from '../components/ui'
import { computeHours, formatDuration } from '../lib/time'
import {
  addDaysISO,
  formatDayShort,
  formatMonthYear,
  fromISODate,
  isoWeek,
  toISODate,
  weekDates,
} from '../lib/dates'

export default function StatsScreen({ settings, pack, t, selectedDate, onSelectDate }: ScreenProps) {
  const contractual = pack?.defaults.contractualDailyMinutes ?? 480

  const days = weekDates(selectedDate)
  const weekEntries =
    useLiveQuery(
      () => db.entries.where('date').between(days[0]!, days[6]!, true, true).toArray(),
      [days[0], days[6]],
      undefined,
    ) ?? []

  const monthRange = useMemo(() => {
    const anchor = fromISODate(selectedDate)
    const first = toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
    const last = toISODate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0))
    return { first, last }
  }, [selectedDate])

  const monthEntries =
    useLiveQuery(
      () => db.entries.where('date').between(monthRange.first, monthRange.last, true, true).toArray(),
      [monthRange.first, monthRange.last],
      undefined,
    ) ?? []

  const perDay = useMemo(
    () =>
      days.map((date) => {
        const forDay = weekEntries.filter((entry) => entry.date === date)
        const totals = sumHours(forDay, contractual)
        return { date, ...totals }
      }),
    [days, weekEntries, contractual],
  )

  const weekTotals = useMemo(() => sumHours(weekEntries, contractual), [weekEntries, contractual])
  const monthTotals = useMemo(
    () => sumHours(monthEntries, contractual),
    [monthEntries, contractual],
  )
  const workedDays = useMemo(
    () => new Set(monthEntries.map((entry) => entry.date)).size,
    [monthEntries],
  )

  const byProject = useMemo(() => groupBy(monthEntries, (e) => e.project, contractual), [monthEntries, contractual])
  const byType = useMemo(
    () => groupBy(monthEntries, (e) => e.interventionType, contractual),
    [monthEntries, contractual],
  )

  const nothing = monthEntries.length === 0 && weekEntries.length === 0

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
          <p className="topbar-title">{t.navStats}</p>
          <p className="topbar-sub">
            {t.week} {isoWeek(selectedDate)}
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
        {nothing ? (
          <Empty title={t.noStatsYet} hint={t.noStatsYetHint} />
        ) : (
          <>
            <div className="totals" style={{ marginBottom: 12 }}>
              <div className="total">
                <div className="total-value">{formatDuration(weekTotals.total)}</div>
                <div className="total-label">{t.weekTotal}</div>
              </div>
              <div className="total">
                <div className={`total-value${weekTotals.extra > 0 ? ' accent' : ''}`}>
                  {formatDuration(weekTotals.extra)}
                </div>
                <div className="total-label">{t.extraHours}</div>
              </div>
              <div className="total">
                <div className="total-value">
                  {perDay.filter((d) => d.total > 0).length}
                </div>
                <div className="total-label">{t.daysWorked}</div>
              </div>
            </div>

            <Card title={t.hoursPerDay}>
              <DayBars
                data={perDay.map((day) => ({
                  label: formatDayShort(day.date, settings.language),
                  normal: day.total - day.extra,
                  extra: day.extra,
                }))}
              />
              <div className="legend">
                <span className="legend-key">
                  <span className="legend-swatch" />
                  {t.normalHours}
                </span>
                <span className="legend-key">
                  <span className="legend-swatch ot" />
                  {t.extraHours}
                </span>
              </div>
            </Card>

            <Card title={`${t.monthTotal} · ${formatMonthYear(selectedDate, settings.language)}`}>
              <div className="totals" style={{ border: 0 }}>
                <div className="total">
                  <div className="total-value">{formatDuration(monthTotals.total)}</div>
                  <div className="total-label">{t.totalHours}</div>
                </div>
                <div className="total">
                  <div className={`total-value${monthTotals.extra > 0 ? ' accent' : ''}`}>
                    {formatDuration(monthTotals.extra)}
                  </div>
                  <div className="total-label">{t.extraHours}</div>
                </div>
                <div className="total">
                  <div className="total-value">
                    {workedDays > 0 ? formatDuration(monthTotals.total / workedDays) : '0h'}
                  </div>
                  <div className="total-label">{t.averageDay}</div>
                </div>
              </div>
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

interface BarDatum {
  label: string
  normal: number
  extra: number
}

/**
 * A stacked bar per weekday.
 *
 * The scale is pinned to at least the contractual day so a light week does not misleadingly
 * fill the chart, and every bar keeps a visible baseline so empty days read as empty rather
 * than missing.
 */
function DayBars({ data }: { data: BarDatum[] }) {
  const width = 320
  const height = 150
  const padBottom = 26
  const padTop = 16
  const max = Math.max(480, ...data.map((d) => d.normal + d.extra))
  const slot = width / data.length
  const barWidth = Math.min(30, slot * 0.56)
  const scale = (minutes: number) => (minutes / max) * (height - padTop - padBottom)

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <line
        className="chart-grid"
        x1="0"
        y1={height - padBottom}
        x2={width}
        y2={height - padBottom}
      />
      {data.map((datum, index) => {
        const total = datum.normal + datum.extra
        const x = index * slot + (slot - barWidth) / 2
        const normalH = scale(datum.normal)
        const extraH = scale(datum.extra)
        const baseY = height - padBottom
        return (
          <g key={datum.label + index}>
            {datum.extra > 0 ? (
              <rect
                className="chart-bar ot"
                x={x}
                y={baseY - normalH - extraH}
                width={barWidth}
                height={Math.max(extraH, 2)}
                rx="2"
              />
            ) : null}
            {datum.normal > 0 ? (
              <rect
                className="chart-bar"
                x={x}
                y={baseY - normalH}
                width={barWidth}
                height={Math.max(normalH, 2)}
                rx="2"
              />
            ) : null}
            {total > 0 ? (
              <text
                className="chart-value"
                x={x + barWidth / 2}
                y={baseY - normalH - extraH - 5}
                textAnchor="middle"
              >
                {Math.round((total / 60) * 10) / 10}
              </text>
            ) : null}
            <text
              className="chart-label"
              x={x + barWidth / 2}
              y={height - 8}
              textAnchor="middle"
            >
              {datum.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Breakdown({ rows }: { rows: { name: string; minutes: number }[] }) {
  const max = Math.max(...rows.map((row) => row.minutes), 1)
  return (
    <div>
      {rows.map((row) => (
        <div className="breakdown-row" key={row.name}>
          <span className="breakdown-name">{row.name}</span>
          <span className="breakdown-value">{formatDuration(row.minutes)}</span>
          <span className="meter">
            <span className="meter-fill" style={{ width: `${(row.minutes / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

function sumHours(entries: Entry[], contractual: number) {
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
  return { total, extra }
}

function groupBy(entries: Entry[], key: (entry: Entry) => string, contractual: number) {
  const map = new Map<string, number>()
  for (const entry of entries) {
    const name = key(entry).trim()
    if (name === '') continue
    const { totalMinutes } = computeHours(
      entry.startMinutes,
      entry.endMinutes,
      contractual,
      entry.extraMinutesOverride,
    )
    map.set(name, (map.get(name) ?? 0) + totalMinutes)
  }
  return [...map.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
}
