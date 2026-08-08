/**
 * Company Pack builder.
 *
 * A desk tool, not a field tool. It takes a company's own .xlsx template plus a form of
 * values and emits the single file a technician imports.
 *
 * This file — and this whole repository — contains no company data. Every real value is
 * typed in here by whoever builds the pack, and the result is distributed internally. That
 * is the entire point: the app is public, the company's details are not.
 *
 * Everything runs in the browser. The template is never uploaded anywhere.
 */

import { useMemo, useRef, useState } from 'react'
import type { ColumnKey, CompanyPackFile, DurationFormat, Person } from '../types'
import { COLUMN_KEYS } from '../types'
import { bytesToBase64 } from '../lib/base64'
import { columnLetter, readHeaderRow } from '../lib/xlsx'
import { PackError, parsePack, serialisePack } from '../lib/pack'
import { downloadBlob } from '../components/ui'
import { Logo } from '../components/Logo'
import { formatClock, parseClock } from '../lib/time'

/** Columns without which the report would be meaningless. */
const REQUIRED: ColumnKey[] = ['date', 'project', 'description', 'technicianName']

const COLUMN_LABELS: Record<ColumnKey, string> = {
  date: 'Date',
  month: 'Month name',
  week: 'Week number',
  project: 'Project',
  section: 'Section',
  interventionType: 'Intervention type',
  statusPercent: 'Status %',
  description: 'Description of work',
  impresa: 'Contractor (fixed)',
  cliente: 'Client (fixed)',
  technicianName: 'Technician name',
  technicianEmail: 'Technician e-mail',
  startTime: 'Start time',
  endTime: 'End time',
  totalHours: 'Total hours',
  normalHours: 'Normal hours',
  extraHours: 'Overtime hours',
}

interface Draft {
  label: string
  packVersion: string
  templateBase64: string
  templateName: string
  headerRow: number
  dataStartRow: number
  columns: Partial<Record<ColumnKey, number>>
  timeFormat: DurationFormat
  totalFormat: DurationFormat
  hoursFormat: DurationFormat
  percentScale: 1 | 100
  uppercaseMonth: boolean
  emptySectionText: string
  impresa: string
  cliente: string
  projects: string
  sections: string
  interventionTypes: string
  colleagues: string
  startMinutes: number
  endMinutes: number
  contractualDailyMinutes: number
  emailDomain: string
  fileNamePattern: string
}

const EMPTY: Draft = {
  label: '',
  packVersion: new Date().toISOString().slice(0, 7).replace('-', '.'),
  templateBase64: '',
  templateName: '',
  headerRow: 8,
  dataStartRow: 10,
  columns: {},
  timeFormat: 'fraction',
  totalFormat: 'fraction',
  hoursFormat: 'decimal',
  percentScale: 1,
  uppercaseMonth: true,
  emptySectionText: 'N/A',
  impresa: '',
  cliente: '',
  projects: '',
  sections: '',
  interventionTypes: '',
  colleagues: '',
  startMinutes: 7 * 60,
  endMinutes: 15 * 60,
  contractualDailyMinutes: 8 * 60,
  emailDomain: '',
  fileNamePattern: 'Report_S{week}_{year}_{name}',
}

export default function PackBuilder() {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [headers, setHeaders] = useState<string[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const templateRef = useRef<HTMLInputElement>(null)
  const packRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const columnChoices = useMemo(() => {
    const count = Math.max(headers.length, 20)
    return Array.from({ length: count }, (_, index) => ({
      index,
      label: `${columnLetter(index)}${headers[index] ? ` — ${headers[index]}` : ''}`,
    }))
  }, [headers])

  const loadTemplate = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const found = readHeaderRow(bytes, draft.headerRow)
      setHeaders(found)
      setDraft((current) => ({
        ...current,
        templateBase64: bytesToBase64(bytes),
        templateName: file.name,
        // Only guess a mapping the first time; never overwrite deliberate choices.
        columns:
          Object.keys(current.columns).length === 0 ? guessColumns(found) : current.columns,
      }))
      setNotice(
        found.length > 0
          ? `Read ${found.filter(Boolean).length} column headings from row ${draft.headerRow}.`
          : `No headings found on row ${draft.headerRow}. Set the heading row and load again.`,
      )
    } catch {
      setError('That file could not be read as an .xlsx template.')
    } finally {
      if (templateRef.current) templateRef.current.value = ''
    }
  }

  const loadExistingPack = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const parsed = parsePack(JSON.parse(await file.text()))
      setDraft({
        ...EMPTY,
        label: parsed.label,
        packVersion: parsed.packVersion,
        templateBase64: parsed.templateBase64,
        templateName: 'from pack',
        headerRow: Math.max(1, parsed.sheet.dataStartRow - 2),
        dataStartRow: parsed.sheet.dataStartRow,
        columns: parsed.sheet.columns,
        timeFormat: parsed.sheet.timeFormat,
        totalFormat: parsed.sheet.totalFormat,
        hoursFormat: parsed.sheet.hoursFormat,
        percentScale: parsed.sheet.percentScale,
        uppercaseMonth: parsed.sheet.uppercaseMonth,
        emptySectionText: parsed.sheet.emptySectionText,
        impresa: parsed.constants.impresa,
        cliente: parsed.constants.cliente,
        projects: parsed.lists.projects.join('\n'),
        sections: parsed.lists.sections.join('\n'),
        interventionTypes: parsed.lists.interventionTypes.join('\n'),
        colleagues: parsed.lists.colleagues
          .map((p) => (p.email ? `${p.name}, ${p.email}` : p.name))
          .join('\n'),
        startMinutes: parsed.defaults.startMinutes,
        endMinutes: parsed.defaults.endMinutes,
        contractualDailyMinutes: parsed.defaults.contractualDailyMinutes,
        emailDomain: parsed.emailDomain,
        fileNamePattern: parsed.fileNamePattern,
      })
      setHeaders(readHeaderRow(base64ToBytesSafe(parsed.templateBase64), 8))
      setNotice('Loaded an existing pack. Change what you need and save it again.')
    } catch (cause) {
      setError(cause instanceof PackError ? cause.message : 'That file is not a company pack.')
    } finally {
      if (packRef.current) packRef.current.value = ''
    }
  }

  const build = (): CompanyPackFile => ({
    formatVersion: 1,
    packVersion: draft.packVersion.trim() || '1',
    label: draft.label.trim(),
    templateBase64: draft.templateBase64,
    sheet: {
      dataStartRow: draft.dataStartRow,
      columns: draft.columns,
      timeFormat: draft.timeFormat,
      totalFormat: draft.totalFormat,
      hoursFormat: draft.hoursFormat,
      percentScale: draft.percentScale,
      uppercaseMonth: draft.uppercaseMonth,
      emptySectionText: draft.emptySectionText.trim() || 'N/A',
    },
    constants: { impresa: draft.impresa.trim(), cliente: draft.cliente.trim() },
    lists: {
      projects: lines(draft.projects),
      sections: lines(draft.sections),
      interventionTypes: lines(draft.interventionTypes),
      colleagues: parsePeople(draft.colleagues),
    },
    defaults: {
      startMinutes: draft.startMinutes,
      endMinutes: draft.endMinutes,
      contractualDailyMinutes: draft.contractualDailyMinutes,
    },
    emailDomain: draft.emailDomain.trim(),
    fileNamePattern: draft.fileNamePattern.trim() || 'Report_S{week}_{year}_{name}',
  })

  const save = () => {
    setError('')
    try {
      // Round-trip through the app's own validator: whatever downloads here is guaranteed
      // to be something the app will accept.
      const pack = parsePack(JSON.parse(serialisePack(build())))
      const name = pack.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'company'
      downloadBlob(
        new Blob([serialisePack(pack)], { type: 'application/json' }),
        `${name}_${pack.packVersion}.json`,
      )
      setNotice('Pack saved. Send this file to the technicians — never commit it.')
    } catch (cause) {
      setError(cause instanceof PackError ? cause.message : 'The pack could not be built.')
    }
  }

  const missing = REQUIRED.filter((key) => draft.columns[key] === undefined)
  const ready = draft.templateBase64 !== '' && missing.length === 0 && draft.label.trim() !== ''

  return (
    <div className="builder">
      <header className="builder-head">
        <Logo size={44} />
        <h1>Company Pack Builder</h1>
        <p>
          Turns a company's Excel template and its lists into the single file a technician
          imports. Everything happens in this browser — nothing is uploaded.
        </p>
        <p className="builder-warning">
          The file this produces contains company data. Send it through internal channels
          only. Never commit it to the repository.
        </p>
      </header>

      <Step number={1} title="Identify this pack">
        <div className="builder-grid">
          <Labelled label="Name shown to technicians">
            <input
              className="input"
              value={draft.label}
              placeholder="Site or contract name"
              onChange={(e) => set('label', e.target.value)}
            />
          </Labelled>
          <Labelled label="Pack version">
            <input
              className="input"
              value={draft.packVersion}
              onChange={(e) => set('packVersion', e.target.value)}
            />
          </Labelled>
        </div>
      </Step>

      <Step number={2} title="Excel template">
        <input
          ref={templateRef}
          type="file"
          accept=".xlsx"
          className="visually-hidden"
          onChange={(e) => void loadTemplate(e.target.files?.[0])}
        />
        <div className="builder-grid">
          <Labelled label="Heading row">
            <input
              className="input"
              type="number"
              min={1}
              value={draft.headerRow}
              onChange={(e) => set('headerRow', Number(e.target.value) || 1)}
            />
          </Labelled>
          <Labelled label="First data row">
            <input
              className="input"
              type="number"
              min={1}
              value={draft.dataStartRow}
              onChange={(e) => set('dataStartRow', Number(e.target.value) || 1)}
            />
          </Labelled>
        </div>
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => templateRef.current?.click()}>
            {draft.templateBase64 ? 'Replace template' : 'Choose .xlsx template'}
          </button>
          {draft.templateName ? (
            <p className="linecount">
              Loaded: {draft.templateName} ·{' '}
              {Math.round((draft.templateBase64.length * 0.75) / 1024)} KB
            </p>
          ) : null}
        </div>
      </Step>

      <Step number={3} title="Map the columns">
        <p className="hint" style={{ marginTop: 0 }}>
          Point each field at the column it belongs in. Leave a field blank to skip that
          column entirely.
        </p>
        <table className="map-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Column in the template</th>
            </tr>
          </thead>
          <tbody>
            {COLUMN_KEYS.map((key) => (
              <tr key={key}>
                <td>
                  {COLUMN_LABELS[key]}
                  {REQUIRED.includes(key) ? <span className="map-required">*</span> : null}
                </td>
                <td>
                  <select
                    value={draft.columns[key] ?? ''}
                    onChange={(e) =>
                      setDraft((current) => {
                        const columns = { ...current.columns }
                        if (e.target.value === '') delete columns[key]
                        else columns[key] = Number(e.target.value)
                        return { ...current, columns }
                      })
                    }
                  >
                    <option value="">— not used —</option>
                    {columnChoices.map((choice) => (
                      <option key={choice.index} value={choice.index}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Step>

      <Step number={4} title="How values are written">
        <div className="builder-grid">
          <Labelled label="Clock times">
            <FormatSelect
              value={draft.timeFormat}
              onChange={(value) => set('timeFormat', value)}
            />
          </Labelled>
          <Labelled label="Total hours column">
            <FormatSelect
              value={draft.totalFormat}
              onChange={(value) => set('totalFormat', value)}
            />
          </Labelled>
          <Labelled label="Normal and overtime hours columns">
            <FormatSelect
              value={draft.hoursFormat}
              onChange={(value) => set('hoursFormat', value)}
            />
          </Labelled>
          <Labelled label="Status column">
            <select
              className="input"
              value={draft.percentScale}
              onChange={(e) => set('percentScale', Number(e.target.value) === 100 ? 100 : 1)}
            >
              <option value={1}>Formatted as a percentage (100% is stored as 1)</option>
              <option value={100}>Plain number (100% is stored as 100)</option>
            </select>
          </Labelled>
          <Labelled label="Text when there is no section">
            <input
              className="input"
              value={draft.emptySectionText}
              onChange={(e) => set('emptySectionText', e.target.value)}
            />
          </Labelled>
        </div>
        <label
          style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, fontWeight: 600 }}
        >
          <input
            type="checkbox"
            checked={draft.uppercaseMonth}
            onChange={(e) => set('uppercaseMonth', e.target.checked)}
            style={{ width: 22, height: 22 }}
          />
          Write month names in capitals (LUGLIO). Month names are always Italian.
        </label>
      </Step>

      <Step number={5} title="Fixed values">
        <div className="builder-grid">
          <Labelled label="Contractor">
            <input
              className="input"
              value={draft.impresa}
              onChange={(e) => set('impresa', e.target.value)}
            />
          </Labelled>
          <Labelled label="Client">
            <input
              className="input"
              value={draft.cliente}
              onChange={(e) => set('cliente', e.target.value)}
            />
          </Labelled>
          <Labelled label="E-mail domain">
            <input
              className="input"
              value={draft.emailDomain}
              placeholder="@company.com"
              onChange={(e) => set('emailDomain', e.target.value)}
            />
          </Labelled>
          <Labelled label="Exported file name">
            <input
              className="input"
              value={draft.fileNamePattern}
              onChange={(e) => set('fileNamePattern', e.target.value)}
            />
          </Labelled>
        </div>
        <p className="linecount">
          File name placeholders: {'{week} {year} {name} {from} {to}'}
        </p>
      </Step>

      <Step number={6} title="Lists the technician chooses from">
        <div className="builder-grid">
          <ListField
            label="Projects"
            value={draft.projects}
            onChange={(value) => set('projects', value)}
            hint="One per line. The first is offered first."
          />
          <ListField
            label="Sections"
            value={draft.sections}
            onChange={(value) => set('sections', value)}
            hint="One per line. May be left empty."
          />
          <ListField
            label="Intervention types"
            value={draft.interventionTypes}
            onChange={(value) => set('interventionTypes', value)}
            hint="One per line, spelled exactly as the report must show them."
          />
          <ListField
            label="Colleagues"
            value={draft.colleagues}
            onChange={(value) => set('colleagues', value)}
            hint="One per line: Name, email"
          />
        </div>
      </Step>

      <Step number={7} title="Default working day">
        <div className="builder-grid">
          <Labelled label="Start">
            <ClockInput value={draft.startMinutes} onChange={(v) => set('startMinutes', v)} />
          </Labelled>
          <Labelled label="End">
            <ClockInput value={draft.endMinutes} onChange={(v) => set('endMinutes', v)} />
          </Labelled>
          <Labelled label="Hours before overtime starts">
            <ClockInput
              value={draft.contractualDailyMinutes}
              onChange={(v) => set('contractualDailyMinutes', v)}
            />
          </Labelled>
        </div>
      </Step>

      {missing.length > 0 && draft.templateBase64 ? (
        <p className="error">
          Still to map: {missing.map((key) => COLUMN_LABELS[key]).join(', ')}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {notice && !error ? <p className="hint">{notice}</p> : null}

      <div className="builder-actions">
        <input
          ref={packRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => void loadExistingPack(e.target.files?.[0])}
        />
        <button type="button" className="btn" onClick={() => packRef.current?.click()}>
          Open an existing pack
        </button>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={save}>
          Save company pack
        </button>
      </div>
    </div>
  )
}

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="builder-step">
      <h2 className="builder-step-title">
        <span className="builder-step-number">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function ListField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  hint: string
}) {
  const count = lines(value).length
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      <textarea
        className="input"
        style={{ minHeight: 130 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="linecount">
        {count} {count === 1 ? 'entry' : 'entries'} · {hint}
      </p>
    </label>
  )
}

function FormatSelect({
  value,
  onChange,
}: {
  value: DurationFormat
  onChange: (next: DurationFormat) => void
}) {
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value as DurationFormat)}
    >
      <option value="fraction">Excel time (08:00 shows as a clock)</option>
      <option value="decimal">Decimal number (7.5)</option>
      <option value="hhmm">Text (7:30)</option>
    </select>
  )
}

function ClockInput({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="input"
      value={draft ?? formatClock(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) {
          const parsed = parseClock(draft)
          if (parsed !== null) onChange(parsed)
          setDraft(null)
        }
      }}
    />
  )
}

/** A first guess at the mapping, from the template's own headings. */
function guessColumns(headers: string[]): Partial<Record<ColumnKey, number>> {
  const patterns: [ColumnKey, RegExp][] = [
    ['date', /^(data|fecha|date)$/i],
    ['month', /^(mese|mes|month)$/i],
    ['week', /^(settimana|semana|week)$/i],
    ['project', /^(progetto|proyecto|project)$/i],
    ['section', /(bp|sezione|secci|section)/i],
    ['interventionType', /(tipo)/i],
    ['statusPercent', /(stato|estado|status)/i],
    ['description', /(lavoro|trabajo|descri|work)/i],
    ['impresa', /^(impresa|empresa)$/i],
    ['cliente', /^(cliente|client)$/i],
    ['technicianName', /^(tecnico|técnico|technician)$/i],
    ['technicianEmail', /(mail)/i],
    ['startTime', /(inizio|inicio|start)/i],
    ['endTime', /(fine|fin|end)/i],
    ['totalHours', /(total)/i],
    ['normalHours', /(normale|normal)/i],
    ['extraHours', /(extra)/i],
  ]

  const columns: Partial<Record<ColumnKey, number>> = {}
  const taken = new Set<number>()
  for (const [key, pattern] of patterns) {
    const index = headers.findIndex(
      (heading, i) => heading && !taken.has(i) && pattern.test(heading.trim()),
    )
    if (index >= 0) {
      columns[key] = index
      taken.add(index)
    }
  }
  return columns
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function parsePeople(value: string): Person[] {
  return lines(value).map((line) => {
    const [name, email] = line.split(',')
    return { name: (name ?? '').trim(), email: (email ?? '').trim() }
  })
}

function base64ToBytesSafe(base64: string): Uint8Array {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return new Uint8Array()
  }
}
