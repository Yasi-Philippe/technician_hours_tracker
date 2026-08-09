/**
 * One day's reports, with everything needed to change them.
 *
 * Extracted from the day screen so the calendar can show a day in place. Tapping a date
 * used to throw the technician onto a different tab, which loses the month they were
 * looking at and makes "let me just check the 12th" cost a round trip.
 *
 * Owning the draft here means both screens edit through exactly the same path — there is
 * one save, one delete, one undo, and no second copy to drift.
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, putEntry, deleteEntry as removeEntry } from '../db'
import type { CompanyPack, Entry, Settings } from '../types'
import type { Strings } from '../i18n'
import { entrySetup, forgetPerson, forgetValue, rememberFromEntry } from '../screens/shared'
import { EntryForm, type EntryDraft, type ForgettableList } from './EntryForm'
import { Empty, HoursSummary, type ToastState } from './ui'
import { computeHours, formatClock, formatDuration } from '../lib/time'

export function DayEntries({
  date,
  settings,
  pack,
  t,
  onUpdateSettings,
  onToast,
  compact = false,
}: {
  date: string
  settings: Settings
  pack: CompanyPack | null
  t: Strings
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  onToast: (toast: ToastState) => void
  /** Inside the calendar the totals row is redundant with what is already on screen. */
  compact?: boolean
}) {
  const [draft, setDraft] = useState<EntryDraft | null>(null)

  const dayEntries =
    useLiveQuery(
      async (): Promise<Entry[]> =>
        (await db.entries.where('date').equals(date).toArray()).sort(
          (a, b) => (a.segments[0]?.startMinutes ?? 0) - (b.segments[0]?.startMinutes ?? 0),
        ),
      [date],
    ) ?? []

  const recent =
    useLiveQuery(() => db.entries.orderBy('updatedAt').reverse().limit(40).toArray(), [], []) ?? []

  const setup = useMemo(() => entrySetup(pack, settings), [pack, settings])

  const totals = useMemo(() => {
    let total = 0
    let extra = 0
    for (const entry of dayEntries) {
      const hours = computeHours(
        entry.segments,
        setup.contractualDailyMinutes,
        entry.extraMinutesOverride,
      )
      total += hours.totalMinutes
      extra += hours.extraMinutes
    }
    return { total, extra }
  }, [dayEntries, setup])

  /** The most recent entry before this day — the basis for "same as yesterday". */
  const previous = useMemo(() => {
    const earlier = recent
      .filter((entry) => entry.date < date)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    return earlier[0] ?? null
  }, [recent, date])

  const blankDraft = (): EntryDraft => ({
    id: null,
    date,
    segments: [
      {
        startMinutes: settings.lastStartMinutes || setup.startMinutes,
        endMinutes: settings.lastEndMinutes || setup.endMinutes,
      },
    ],
    extraMinutesOverride: null,
    project: settings.lastProject || setup.projects[0] || '',
    section: settings.lastSection,
    interventionType: settings.lastInterventionType || setup.interventionTypes[0] || '',
    statusPercent: 100,
    description: '',
    colleagues: [],
  })

  const draftFromEntry = (entry: Entry): EntryDraft => ({
    id: entry.id,
    date: entry.date,
    segments: entry.segments.map((range) => ({ ...range })),
    extraMinutesOverride: entry.extraMinutesOverride,
    project: entry.project,
    section: entry.section,
    interventionType: entry.interventionType,
    statusPercent: entry.statusPercent,
    description: entry.description,
    colleagues: entry.colleagues,
  })

  /** Everything from the last recorded day except the description, which is never the same. */
  const repeatPrevious = () => {
    if (!previous) return
    setDraft({ ...draftFromEntry(previous), id: null, date, description: '' })
  }

  const save = async () => {
    if (!draft) return
    const now = Date.now()
    const existing = draft.id ? await db.entries.get(draft.id) : undefined

    const entry: Entry = {
      id: draft.id ?? newId(),
      date: draft.date,
      segments: draft.segments,
      extraMinutesOverride: draft.extraMinutesOverride,
      project: draft.project.trim(),
      section: draft.section.trim(),
      interventionType: draft.interventionType.trim(),
      statusPercent: draft.statusPercent,
      description: draft.description.trim(),
      technician: existing?.technician ?? settings.technician,
      colleagues: draft.colleagues,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await putEntry(entry)
    // Remember the choices so tomorrow starts from what today looked like, and keep any
    // hand-typed value so it can be offered again — and removed later if it was a typo.
    await onUpdateSettings({
      lastProject: entry.project,
      lastSection: entry.section,
      lastInterventionType: entry.interventionType,
      lastStartMinutes: entry.segments[0]!.startMinutes,
      lastEndMinutes: entry.segments[0]!.endMinutes,
      ...rememberFromEntry(settings, entry, pack),
    })

    setDraft(null)
    onToast({ message: t.saved, tone: 'ok' })
  }

  /** Forget a hand-typed value. Saved reports keep their own copy of the text. */
  const forget = (list: ForgettableList, value: string) => {
    if (list === 'colleagues') {
      void onUpdateSettings({ customColleagues: forgetPerson(settings.customColleagues, value) })
    } else {
      void onUpdateSettings({
        customValues: { ...settings.customValues, [list]: forgetValue(settings.customValues[list], value) },
      })
    }
    onToast({ message: t.removedFromList })
  }

  const remove = async () => {
    if (!draft?.id) return
    const snapshot = await db.entries.get(draft.id)
    await removeEntry(draft.id)
    setDraft(null)
    onToast({
      message: t.deleted,
      action: snapshot ? { label: t.undo, run: () => void putEntry(snapshot) } : undefined,
    })
  }

  return (
    <>
      {dayEntries.length > 0 ? (
        <>
          {compact ? null : (
            <div className="totals" style={{ marginBottom: 14 }}>
              <div className="total">
                <div className="total-value">{formatDuration(totals.total)}</div>
                <div className="total-label">{t.totalHours}</div>
              </div>
              <div className="total">
                <div className="total-value">{formatDuration(totals.total - totals.extra)}</div>
                <div className="total-label">{t.normalHours}</div>
              </div>
              <div className="total">
                <div className={`total-value${totals.extra > 0 ? ' accent' : ''}`}>
                  {formatDuration(totals.extra)}
                </div>
                <div className="total-label">{t.extraHours}</div>
              </div>
            </div>
          )}

          <div>
            {dayEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                contractualMinutes={setup.contractualDailyMinutes}
                extraLabel={t.extraShort}
                onOpen={() => setDraft(draftFromEntry(entry))}
              />
            ))}
          </div>
        </>
      ) : (
        <Empty title={t.noEntriesToday} hint={t.noEntriesTodayHint} />
      )}

      <div className="stack" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => setDraft(blankDraft())}
        >
          {t.addEntry}
        </button>
        {previous && dayEntries.length === 0 ? (
          <button type="button" className="btn" onClick={repeatPrevious}>
            {t.sameAsYesterday}
          </button>
        ) : null}
      </div>

      {draft ? (
        <EntryForm
          draft={draft}
          setDraft={setDraft}
          pack={pack}
          settings={settings}
          t={t}
          recentEntries={recent}
          onSave={() => void save()}
          onDelete={draft.id ? () => void remove() : undefined}
          onClose={() => setDraft(null)}
          onForget={forget}
        />
      ) : null}
    </>
  )
}

function EntryCard({
  entry,
  contractualMinutes,
  extraLabel,
  onOpen,
}: {
  entry: Entry
  contractualMinutes: number
  extraLabel: string
  onOpen: () => void
}) {
  const hours = computeHours(
        entry.segments,
    contractualMinutes,
    entry.extraMinutesOverride,
  )
  return (
    <button
      type="button"
      className={`entry${hours.extraMinutes > 0 ? ' has-overtime' : ''}`}
      onClick={onOpen}
    >
      <div className="entry-top">
        <span className="entry-time">
          {entry.segments.map((range, i) => (
            <span key={i} className="entry-range">
              {formatClock(range.startMinutes)} – {formatClock(range.endMinutes)}
            </span>
          ))}
        </span>
        <span className="entry-hours">
          <HoursSummary
            totalMinutes={hours.totalMinutes}
            extraMinutes={hours.extraMinutes}
            extraLabel={extraLabel}
          />
        </span>
      </div>
      <div className="entry-project">
        {entry.project}
        {entry.section ? ` · ${entry.section}` : ''}
      </div>
      {entry.description ? <div className="entry-desc">{entry.description}</div> : null}
      <div className="entry-meta">
        <span className="pill">{entry.interventionType}</span>
        {entry.statusPercent !== 100 ? (
          <span className="pill accent">{entry.statusPercent}%</span>
        ) : null}
        {entry.colleagues.map((person) => (
          <span key={person.name} className="pill">
            {person.name}
          </span>
        ))}
      </div>
    </button>
  )
}
