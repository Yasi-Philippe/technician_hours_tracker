/**
 * Producing the spreadsheet.
 *
 * The summary is shown in plain language before anything is generated, because this is
 * the file that goes to the office and a wrong range is embarrassing to discover later.
 *
 * One intervention is one row, however many people were on it, so the people who worked
 * in the range are listed rather than counted as rows.
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { CompanyPack, Entry, Settings } from '../types'
import type { Strings } from '../i18n'
import { Sheet, downloadBlob, type ToastState } from './ui'
import { buildReport, reportRows, summarise, type ReportRange } from '../lib/report'
import { formatDuration } from '../lib/time'
import {
  endOfMonthISO,
  formatMonthYear,
  formatShortDate,
  isoWeek,
  startOfMonthISO,
  weekDates,
} from '../lib/dates'

export function ExportSheet({
  pack,
  settings,
  t,
  anchorDate,
  onToast,
  onClose,
}: {
  pack: CompanyPack
  settings: Settings
  t: Strings
  anchorDate: string
  onToast: (toast: ToastState) => void
  onClose: () => void
}) {
  const [range, setRange] = useState<ReportRange>('week')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const days = weekDates(anchorDate)

  // `null` means the whole history, which has no bounds to query between.
  const bounds = useMemo(() => {
    if (range === 'week') return { from: days[0]!, to: days[6]! }
    if (range === 'month') {
      return { from: startOfMonthISO(anchorDate), to: endOfMonthISO(anchorDate) }
    }
    return null
  }, [range, anchorDate, days])

  const entries =
    useLiveQuery(
      async (): Promise<Entry[]> =>
        bounds
          ? db.entries.where('date').between(bounds.from, bounds.to, true, true).toArray()
          : db.entries.orderBy('date').toArray(),
      [bounds?.from, bounds?.to],
    ) ?? []

  const summary = useMemo(() => summarise(reportRows(entries), pack), [entries, pack])
  const dates = useMemo(() => entries.map((entry) => entry.date).sort(), [entries])

  const run = () => {
    setBusy(true)
    setError('')
    try {
      const report = buildReport(entries, pack, {
        anchorDate,
        technicianName: settings.technician.name,
        range,
      })
      downloadBlob(
        new Blob([report.bytes as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        report.filename,
      )
      onToast({ message: t.exportDone, tone: 'ok' })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errorTitle)
    } finally {
      setBusy(false)
    }
  }

  const heading =
    range === 'week'
      ? `${t.week} ${isoWeek(anchorDate)}`
      : range === 'month'
        ? formatMonthYear(anchorDate, settings.language)
        : t.exportAllRange

  const period =
    dates.length === 0
      ? ''
      : `${formatShortDate(dates[0]!)} – ${formatShortDate(dates[dates.length - 1]!)}`

  return (
    <Sheet
      title={t.exportTitle}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy || entries.length === 0}
          onClick={run}
        >
          {t.exportButton}
        </button>
      }
    >
      <span className="field-label">{t.exportRange}</span>
      <div className="options cols-4" style={{ marginBottom: 16 }}>
        {(['week', 'month', 'all'] as ReportRange[]).map((option) => (
          <button
            key={option}
            type="button"
            className={`option${range === option ? ' is-selected' : ''}`}
            aria-pressed={range === option}
            onClick={() => setRange(option)}
          >
            {option === 'week' ? t.modeWeek : option === 'month' ? t.modeMonth : t.rangeAll}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title" style={{ textTransform: 'none' }}>
            {heading}
          </h2>
          <span className="row-value">{period}</span>
        </div>
        <div className="card-body">
          <div className="totals" style={{ border: 0 }}>
            <div className="total">
              <div className="total-value">{formatDuration(summary.totalMinutes)}</div>
              <div className="total-label">{t.totalHours}</div>
            </div>
            <div className="total">
              <div className={`total-value${summary.extraMinutes > 0 ? ' accent' : ''}`}>
                {formatDuration(summary.extraMinutes)}
              </div>
              <div className="total-label">{t.extraHours}</div>
            </div>
            <div className="total">
              <div className="total-value">{summary.dayCount}</div>
              <div className="total-label">{t.exportDays}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rows" style={{ marginTop: 12 }}>
        <div className="row row-static">
          <span className="row-label">{t.exportEntries}</span>
          <span className="row-value">{summary.entryCount}</span>
        </div>
        {summary.technicians.length > 1 ? (
          <div className="row row-static">
            <span className="row-label">{t.exportTechnicians}</span>
            <span className="row-value">{summary.technicians.join(', ')}</span>
          </div>
        ) : null}
      </div>

      {entries.length === 0 ? <p className="hint">{t.exportEmpty}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </Sheet>
  )
}
