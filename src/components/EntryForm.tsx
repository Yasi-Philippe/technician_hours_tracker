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
import type { CompanyPack, Entry, Person, Settings, TimeRange } from '../types'
import type { Strings } from '../i18n'
import { clamp, computeHours, formatDuration, type Hours } from '../lib/time'
import { Field, OptionGrid, RemoveConfirm, Sheet, TimeBox } from './ui'
import { entrySetup, optionsWith, recentDescriptions } from '../screens/shared'
import { rankOptions, type Usage } from '../lib/ranking'
import { formatLongDate } from '../lib/dates'

const STATUS_CHOICES = [100, 75, 50, 25]

/**
 * How many of the technician's *own* values stay on screen, and how many wait behind
 * "Altro…". Everything the company file lists is always shown, whatever these say.
 */
const VISIBLE_CUSTOM = 4
const EXTRA_CUSTOM = 12

export interface EntryDraft {
  id: string | null
  date: string
  segments: TimeRange[]
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
  usage,
  onSave,
  onDelete,
  onClose,
  onForget,
}: {
  draft: EntryDraft
  setDraft: (next: EntryDraft) => void
  /** Null until a company file is loaded; the form works either way. */
  pack: CompanyPack | null
  settings: Settings
  t: Strings
  recentEntries: Entry[]
  /** How often each value was used recently, which decides what is worth showing. */
  usage: {
    projects: Map<string, Usage>
    sections: Map<string, Usage>
    interventionTypes: Map<string, Usage>
  }
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
  /** Forget a colleague the technician typed. Reports already using them are untouched. */
  onForget: (name: string) => void
}) {
  const setup = useMemo(() => entrySetup(pack, settings), [pack, settings])

  const hours = computeHours(
    draft.segments,
    setup.contractualDailyMinutes,
    draft.extraMinutesOverride,
  )

  /*
   * Frozen when the form opens, for two reasons. The lists must not shift while the
   * technician is tapping through them; and the ranking is drawn from recent work, which
   * must not reshuffle the moment this report is saved.
   *
   * Ranked rather than listed in full: a month of varied work would otherwise put every
   * value ever used on screen at once.
   */
  const [options] = useState(() => ({
    projects: rankOptions({
      fromPack: pack?.lists.projects ?? [],
      custom: optionsWith(settings.customValues.projects, draft.project),
      usage: usage.projects,
      pinned: draft.project,
      visibleCustom: VISIBLE_CUSTOM,
      extraCustom: EXTRA_CUSTOM,
    }),
    sections: rankOptions({
      fromPack: pack?.lists.sections ?? [],
      custom: optionsWith(settings.customValues.sections, draft.section),
      usage: usage.sections,
      pinned: draft.section,
      visibleCustom: VISIBLE_CUSTOM,
      extraCustom: EXTRA_CUSTOM,
    }),
    types: rankOptions({
      fromPack: pack?.lists.interventionTypes ?? [],
      custom: optionsWith(settings.customValues.interventionTypes, draft.interventionType),
      usage: usage.interventionTypes,
      pinned: draft.interventionType,
      visibleCustom: VISIBLE_CUSTOM,
      extraCustom: EXTRA_CUSTOM,
    }),
  }))
  const suggestions = useMemo(() => recentDescriptions(recentEntries), [recentEntries])

  return (
    <Sheet
      title={draft.id ? t.editEntry : t.newEntry}
      // Which day this is for. Without it the form is anonymous: open it from a
      // calendar, scroll a little, and there is no way to tell what you are filling in
      // short of closing it and starting again.
      subtitle={formatLongDate(draft.date, settings.language)}
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
      <Segments draft={draft} setDraft={setDraft} t={t} />

      <div className={`hours-readout${hours.extraMinutes > 0 ? ' has-overtime' : ''}`}>
        <div className="hours-readout-top">
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
          contractualMinutes={setup.contractualDailyMinutes}
        />
      </div>

      <Field label={t.project}>
        <OptionGrid
          options={options.projects.shown}
          moreOptions={options.projects.more}
          value={draft.project}
          onChange={(project) => setDraft({ ...draft, project })}
          otherLabel={t.otherValue}
        />
      </Field>

      <Field label={t.section}>
        <OptionGrid
          options={options.sections.shown}
          moreOptions={options.sections.more}
          value={draft.section}
          onChange={(section) => setDraft({ ...draft, section })}
          otherLabel={t.otherValue}
          placeholder={setup.emptySectionText}
        />
      </Field>

      <Field label={t.interventionType}>
        <OptionGrid
          options={options.types.shown}
          moreOptions={options.types.more}
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

      <DescriptionField
        draft={draft}
        setDraft={setDraft}
        t={t}
        suggestions={suggestions}
      />

      <ColleaguePicker
        t={t}
        pool={setup.colleagues}
        selected={draft.colleagues}
        onChange={(colleagues) => setDraft({ ...draft, colleagues })}
        onForget={onForget}
      />
    </Sheet>
  )
}

/**
 * The stretches of work that make up the day.
 *
 * Most days are one stretch and look exactly as they always did — one row of two clocks,
 * no extra controls. A second stretch appears only when asked for, because a split day
 * is the exception and the common case must not pay for it.
 *
 * The alternative, two separate reports, would have been wrong arithmetic rather than
 * just more taps: overtime is judged per report, so 07:00–15:00 plus 17:00–19:00 would
 * have come out as ten hours with none of them extra.
 */
function Segments({
  draft,
  setDraft,
  t,
}: {
  draft: EntryDraft
  setDraft: (next: EntryDraft) => void
  t: Strings
}) {
  const update = (index: number, patch: Partial<TimeRange>) =>
    setDraft({
      ...draft,
      segments: draft.segments.map((range, i) => (i === index ? { ...range, ...patch } : range)),
    })

  const addSegment = () => {
    const last = draft.segments[draft.segments.length - 1]!
    // Start the new stretch an hour after the previous one ended: a callout follows a
    // gap, so an hour is a better first guess than repeating the same times.
    const start = (last.endMinutes + 60) % 1440
    setDraft({
      ...draft,
      segments: [...draft.segments, { startMinutes: start, endMinutes: (start + 120) % 1440 }],
    })
  }

  const removeSegment = (index: number) =>
    setDraft({ ...draft, segments: draft.segments.filter((_, i) => i !== index) })

  return (
    <div>
      {draft.segments.map((range, index) => (
        <div key={index} style={{ marginTop: index === 0 ? 0 : 12 }}>
          {draft.segments.length > 1 ? (
            <div className="segment-head">
              <span className="segment-label">
                {t.segment} {index + 1}
              </span>
              <button
                type="button"
                className="segment-remove"
                onClick={() => removeSegment(index)}
              >
                {t.removeSegment}
              </button>
            </div>
          ) : null}
          <div className="timerow">
            <TimeBox
              label={t.from}
              minutes={range.startMinutes}
              onChange={(startMinutes) => update(index, { startMinutes })}
            />
            <TimeBox
              label={t.to}
              minutes={range.endMinutes}
              onChange={(endMinutes) => update(index, { endMinutes })}
            />
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addSegment}>
        {t.addSegment}
      </button>
    </div>
  )
}

/**
 * The description, plus a way to reuse an earlier one.
 *
 * Past descriptions used to sit under the field as chips, permanently visible and cut
 * off mid-sentence. With months of history that is clutter on the screen someone opens
 * every day, and a truncated chip is impossible to tell apart from a similar one.
 *
 * They are now behind a deliberate tap and shown in full, so the list is only there when
 * it is wanted and is actually readable when it is.
 */
function DescriptionField({
  draft,
  setDraft,
  t,
  suggestions,
}: {
  draft: EntryDraft
  setDraft: (next: EntryDraft) => void
  t: Strings
  suggestions: string[]
}) {
  const [picking, setPicking] = useState(false)

  return (
    <Field label={t.description}>
      <textarea
        className="input"
        value={draft.description}
        placeholder={t.descriptionPlaceholder}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />

      {suggestions.length === 0 ? null : picking ? (
        <div className="reuse">
          <span className="field-label" style={{ marginTop: 14 }}>
            {t.reuseDescriptionTitle}
          </span>
          <div className="reuse-list">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="reuse-item"
                onClick={() => {
                  setDraft({ ...draft, description: suggestion })
                  setPicking(false)
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 10 }}
            onClick={() => setPicking(false)}
          >
            {t.close}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 10 }}
          onClick={() => setPicking(true)}
        >
          {t.reuseDescription}
        </button>
      )}
    </Field>
  )
}

/**
 * Which mode overtime is in, always stated rather than implied.
 *
 * It sits with the hours it describes, directly under the clocks, rather than as a card
 * of its own in the middle of the form — it is a qualifier on a number, not a step in
 * filling the report, and it was carrying far more weight than it earns.
 *
 * Both modes stay visible so the answer to "am I supposed to fill this in?" is on screen.
 * Automatic is the default and stays the default.
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
    <div className="overtime">
      <div className="overtime-row">
        <span className="overtime-label">{t.extraHours}</span>

        <span className="segmented">
          <button
            type="button"
            className={`segmented-btn${manual ? '' : ' is-on'}`}
            aria-pressed={!manual}
            onClick={() => setDraft({ ...draft, extraMinutesOverride: null })}
          >
            {t.overtimeAutomatic}
          </button>
          <button
            type="button"
            className={`segmented-btn${manual ? ' is-on' : ''}`}
            aria-pressed={manual}
            // Seeded with the calculated figure, not zero. Switching to manual to nudge
            // the number by half an hour should not silently wipe it first.
            onClick={() => setDraft({ ...draft, extraMinutesOverride: hours.extraMinutes })}
          >
            {t.overtimeManualMode}
          </button>
        </span>
      </div>

      {manual ? (
        <div className="overtime-row overtime-stepper">
          <button
            type="button"
            className="overtime-step"
            aria-label={`${t.extraHours} −30`}
            onClick={() => step(-30)}
          >
            −
          </button>
          <strong className="overtime-value">{formatDuration(value)}</strong>
          <button
            type="button"
            className="overtime-step"
            aria-label={`${t.extraHours} +30`}
            onClick={() => step(30)}
          >
            +
          </button>
        </div>
      ) : null}

      <p className="overtime-hint">
        {manual
          ? t.overtimeManualExplain
          : t.overtimeAutoExplain.replace('{h}', formatDuration(contractualMinutes))}
      </p>
    </div>
  )
}

function ColleaguePicker({
  t,
  pool,
  selected,
  onChange,
  onForget,
}: {
  t: Strings
  pool: Person[]
  selected: Person[]
  onChange: (next: Person[]) => void
  onForget: (name: string) => void
}) {
  const [typed, setTyped] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
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
            // Every colleague here was typed by this technician, so every one can be
            // taken back out — which is the whole point of the ⋯ beside the name.
            <span
              className={`chip-wrap${isSelected(person) ? ' is-selected' : ''}`}
              key={person.name}
            >
              <button type="button" className="chip" onClick={() => toggle(person)}>
                {person.name}
              </button>
              <button
                type="button"
                className="chip-more"
                aria-label={`${t.moreOptions}: ${person.name}`}
                aria-expanded={confirming === person.name}
                onClick={() => setConfirming(confirming === person.name ? null : person.name)}
              >
                {/* A chevron, not a cross: a cross beside a chosen name reads as
                    "unselect", which is what tapping the name already does. */}
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M2.5 4.5 6 8l3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {confirming !== null ? (
        <RemoveConfirm
          value={confirming}
          removeLabel={t.removeFromList}
          cancelLabel={t.cancel}
          onRemove={() => {
            onForget(confirming)
            onChange(selected.filter((p) => p.name !== confirming))
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
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


