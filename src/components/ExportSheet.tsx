/**
 * Producing the week's spreadsheet.
 *
 * The summary is shown in plain language before anything is generated, because this is
 * the file that goes to the office and a wrong week is embarrassing to discover later.
 *
 * The colleague toggle only appears when there is more than one person in the week —
 * otherwise it is a control that can only ever have one sensible setting.
 */

import { useMemo, useState } from 'react'
import type { CompanyPack, Entry, Settings } from '../types'
import type { Strings } from '../i18n'
import { Sheet, Switch, downloadBlob, type ToastState } from './ui'
import { buildReport, expandRows, summarise } from '../lib/report'
import { formatDuration } from '../lib/time'
import { formatShortDate, isoWeek, weekDates } from '../lib/dates'

export function ExportSheet({
  pack,
  settings,
  t,
  entries,
  anchorDate,
  onToast,
  onClose,
}: {
  pack: CompanyPack
  settings: Settings
  t: Strings
  entries: Entry[]
  anchorDate: string
  onToast: (toast: ToastState) => void
  onClose: () => void
}) {
  const [includeColleagues, setIncludeColleagues] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const days = weekDates(anchorDate)
  const summary = useMemo(
    () => summarise(expandRows(entries, includeColleagues), pack),
    [entries, includeColleagues, pack],
  )
  const hasColleagues = useMemo(
    () => entries.some((entry) => entry.colleagues.length > 0),
    [entries],
  )

  const run = () => {
    setBusy(true)
    setError('')
    try {
      const report = buildReport(entries, pack, {
        anchorDate,
        technicianName: settings.technician.name,
        includeColleagues,
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
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">
            {t.week} {isoWeek(anchorDate)}
          </h2>
          <span className="row-value">
            {formatShortDate(days[0]!)} – {formatShortDate(days[6]!)}
          </span>
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
        <div className="row row-static">
          <span className="row-label">{t.exportRows}</span>
          <span className="row-value">{summary.rowCount}</span>
        </div>
        {summary.technicians.length > 1 ? (
          <div className="row row-static">
            <span className="row-label">{t.exportTechnicians}</span>
            <span className="row-value">{summary.technicians.join(', ')}</span>
          </div>
        ) : null}
      </div>

      {hasColleagues ? (
        <div className="rows" style={{ marginTop: 12 }}>
          <Switch
            label={t.includeColleagues}
            checked={includeColleagues}
            onChange={setIncludeColleagues}
          />
        </div>
      ) : null}

      {entries.length === 0 ? <p className="hint">{t.exportEmpty}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </Sheet>
  )
}
