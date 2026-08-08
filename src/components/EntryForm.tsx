/**
 * The form a technician fills in every day.
 *
 * Ordered by how often a field actually needs touching: the hours first, because they are
 * the point; then the choices, which are one tap each and usually already correct; then
 * the description, which is the only thing that genuinely has to be typed.
 *
 * Overtime is never asked for. It follows from the end time, and the readout under the
 * clocks shows the split live so the result is never a surprise at the end of the month.
 */

import { useMemo, useState } from 'react'
import type { CompanyPack, Entry, Person, Settings } from '../types'
import type { Strings } from '../i18n'
import { clamp, computeHours, formatDuration, type Hours } from '../lib/time'
import { Field, OptionGrid, Sheet, TimeBox } from './ui'
import { optionsWith, recentDescriptions } from '../screens/shared'

const STATUS_CHOICES = [100, 75, 50, 25]

export interface EntryDraft {
  id: string | null
  date: string
  startMinutes: number
  endMinutes: number
  extraMinutesOverride: number | null
  project: string
  section: string
  interventionType: string
  statusPercent: number
  description: string
  colleagues: Person[]
}

export function EntryForm({
  draft,
  setDraft,
  pack,
  settings,
  t,
  recentEntries,
  onSave,
  onDelete,
  onClose,
}: {
  draft: EntryDraft
  setDraft: (next: EntryDraft) => void
  pack: CompanyPack
  settings: Settings
  t: Strings
  recentEntries: Entry[]
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}) {
  const hours = computeHours(
    draft.startMinutes,
    draft.endMinutes,
    pack.defaults.contractualDailyMinutes,
    draft.extraMinutesOverride,
  )

  // Frozen when the form opens. The lists must not shift while the technician is tapping
  // through them, so the current value is folded in once, here, and never again.
  const [options] = useState(() => ({
    projects: optionsWith(pack.lists.projects, draft.project),
    sections: optionsWith(pack.lists.sections, draft.section),
    types: optionsWith(pack.lists.interventionTypes, draft.interventionType),
  }))
  const suggestions = useMemo(() => recentDescriptions(recentEntries), [recentEntries])

  const colleaguePool = useMemo(
    () =>
      dedupePeople([...pack.lists.colleagues, ...settings.customColleagues]).filter(
        (person) => person.name !== settings.technician.name,
      ),
    [pack.lists.colleagues, settings.customColleagues, settings.technician.name],
  )

  return (
    <Sheet
      title={draft.id ? t.editEntry : t.newEntry}
      onClose={onClose}
      footer={
        <div className="stack">
          <button type="button" className="btn btn-primary btn-lg" onClick={onSave}>
            {t.save}
          </button>
          {onDelete ? (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              {t.delete}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="timerow">
        <TimeBox
          label={t.from}
          minutes={draft.startMinutes}
          onChange={(startMinutes) => setDraft({ ...draft, startMinutes })}
        />
        <TimeBox
          label={t.to}
          minutes={draft.endMinutes}
          onChange={(endMinutes) => setDraft({ ...draft, endMinutes })}
        />
      </div>

      <div className={`hours-readout${hours.extraMinutes > 0 ? ' has-overtime' : ''}`}>
        <span className="hours-readout-main">{formatDuration(hours.totalMinutes)}</span>
        <span className="hours-readout-split">
          {formatDuration(hours.normalMinutes)} {t.normalHours.toLowerCase()}
          {hours.extraMinutes > 0 ? (
            <>
              {' · '}
              <b>
                {formatDuration(hours.extraMinutes)} {t.extraHours.toLowerCase()}
              </b>
            </>
          ) : null}
        </span>
      </div>

      <OvertimeMode
        draft={draft}
        setDraft={setDraft}
        t={t}
        hours={hours}
        contractualMinutes={pack.defaults.contractualDailyMinutes}
      />

      <Field label={t.project}>
        <OptionGrid
          options={options.projects}
          value={draft.project}
          onChange={(project) => setDraft({ ...draft, project })}
          otherLabel={t.otherValue}
        />
      </Field>

      <Field label={t.section}>
        <OptionGrid
          options={options.sections}
          value={draft.section}
          onChange={(section) => setDraft({ ...draft, section })}
          otherLabel={t.otherValue}
          placeholder={pack.sheet.emptySectionText}
        />
      </Field>

      <Field label={t.interventionType}>
        <OptionGrid
          options={options.types}
          value={draft.interventionType}
          onChange={(interventionType) => setDraft({ ...draft, interventionType })}
          otherLabel={t.otherValue}
        />
      </Field>

      <Field label={t.status}>
        <div className="options cols-4">
          {STATUS_CHOICES.map((percent) => (
            <button
              key={percent}
              type="button"
              className={`option${draft.statusPercent === percent ? ' is-selected' : ''}`}
              onClick={() => setDraft({ ...draft, statusPercent: percent })}
            >
              {percent}%
            </button>
          ))}
        </div>
      </Field>

      <Field label={t.description}>
        <textarea
          className="input"
          value={draft.description}
          placeholder={t.descriptionPlaceholder}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        {suggestions.length > 0 ? (
          <div className="chips" style={{ marginTop: 10 }}>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip"
                onClick={() => setDraft({ ...draft, description: suggestion })}
              >
                {truncate(suggestion, 34)}
              </button>
            ))}
          </div>
        ) : null}
      </Field>

      <ColleaguePicker
        t={t}
        pool={colleaguePool}
        selected={draft.colleagues}
        onChange={(colleagues) => setDraft({ ...draft, colleagues })}
      />
    </Sheet>
  )
}

/**
 * Which mode overtime is in, always stated rather than implied.
 *
 * The earlier version showed only a "correct the overtime" button, which read as an
 * instruction — several people would reasonably conclude they had to enter overtime by
 * hand every day. Both modes are now visible side by side with the active one selected,
 * so the answer to "am I supposed to fill this in?" is on screen.
 *
 * Automatic is the default and stays the default: nothing here changes unless the
 * technician deliberately switches.
 */
function OvertimeMode({
  draft,
  setDraft,
  t,
  hours,
  contractualMinutes,
}: {
  draft: EntryDraft
  setDraft: (next: EntryDraft) => void
  t: Strings
  hours: Hours
  contractualMinutes: number
}) {
  const manual = draft.extraMinutesOverride !== null
  const value = draft.extraMinutesOverride ?? hours.extraMinutes

  const step = (delta: number) =>
    setDraft({
      ...draft,
      extraMinutesOverride: clamp(value + delta, 0, hours.totalMinutes),
    })

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-body">
        <span className="field-label">{t.extraHours}</span>

        <div className="options cols-2">
          <button
            type="button"
            className={`option${manual ? '' : ' is-selected'}`}
            aria-pressed={!manual}
            onClick={() => setDraft({ ...draft, extraMinutesOverride: null })}
          >
            {t.overtimeAutomatic}
          </button>
          <button
            type="button"
            className={`option${manual ? ' is-selected' : ''}`}
            aria-pressed={manual}
            // Seeded with the calculated figure, not zero. Switching to manual to nudge
            // the number by half an hour should not silently wipe it first.
            onClick={() => setDraft({ ...draft, extraMinutesOverride: hours.extraMinutes })}
          >
            {t.overtimeManualMode}
          </button>
        </div>

        {manual ? (
          <div className="spread" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              style={{ width: 64 }}
              aria-label={`${t.extraHours} −30`}
              onClick={() => step(-30)}
            >
              −
            </button>
            <strong style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(value)}
            </strong>
            <button
              type="button"
              className="btn"
              style={{ width: 64 }}
              aria-label={`${t.extraHours} +30`}
              onClick={() => step(30)}
            >
              +
            </button>
          </div>
        ) : null}

        <p className="hint">
          {manual
            ? t.overtimeManualExplain
            : t.overtimeAutoExplain.replace('{h}', formatDuration(contractualMinutes))}
        </p>
      </div>
    </div>
  )
}

function ColleaguePicker({
  t,
  pool,
  selected,
  onChange,
}: {
  t: Strings
  pool: Person[]
  selected: Person[]
  onChange: (next: Person[]) => void
}) {
  const [typed, setTyped] = useState('')
  const isSelected = (person: Person) => selected.some((p) => p.name === person.name)

  const toggle = (person: Person) => {
    onChange(
      isSelected(person) ? selected.filter((p) => p.name !== person.name) : [...selected, person],
    )
  }

  const addTyped = () => {
    const name = typed.trim()
    if (name === '' || isSelected({ name, email: '' })) return
    onChange([...selected, { name, email: '' }])
    setTyped('')
  }

  return (
    <Field label={t.colleagues}>
      {pool.length > 0 ? (
        <div className="chips">
          {pool.map((person) => (
            <button
              key={person.name}
              type="button"
              className={`chip${isSelected(person) ? ' is-selected' : ''}`}
              onClick={() => toggle(person)}
            >
              {person.name}
            </button>
          ))}
        </div>
      ) : null}

      {selected.filter((person) => !pool.some((p) => p.name === person.name)).length > 0 ? (
        <div className="chips" style={{ marginTop: 8 }}>
          {selected
            .filter((person) => !pool.some((p) => p.name === person.name))
            .map((person) => (
              <button
                key={person.name}
                type="button"
                className="chip is-selected"
                onClick={() => toggle(person)}
              >
                {person.name}
                <span className="chip-remove">✕</span>
              </button>
            ))}
        </div>
      ) : null}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <input
          className="input"
          value={typed}
          placeholder={t.addColleague}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTyped()
            }
          }}
        />
        <button
          type="button"
          className="btn"
          style={{ width: 72 }}
          disabled={typed.trim() === ''}
          onClick={addTyped}
        >
          +
        </button>
      </div>
      {selected.length === 0 ? <p className="hint">{t.colleaguesNone}</p> : null}
    </Field>
  )
}

function dedupePeople(people: Person[]): Person[] {
  const seen = new Set<string>()
  const out: Person[] = []
  for (const person of people) {
    const key = person.name.trim()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push({ name: key, email: person.email })
  }
  return out
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
