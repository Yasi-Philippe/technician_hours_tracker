/**
 * The screen a technician opens every afternoon.
 *
 * Everything on it is aimed at one number: how many taps between opening the app and
 * having the day recorded. Today is already selected, the times are already right, the
 * project is the one from yesterday — so a standard day is Add, Save.
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, putEntry, deleteEntry as removeEntry } from '../db'
import type { Entry } from '../types'
import type { ScreenProps } from './shared'
import { WeekStrip } from '../components/WeekStrip'
import { EntryForm, type EntryDraft } from '../components/EntryForm'
import { Empty, HoursSummary } from '../components/ui'
import { computeHours, formatClock, formatDuration } from '../lib/time'
import { formatLongDate, todayISO, weekDates } from '../lib/dates'

export default function DayScreen({
  settings,
  pack,
  t,
  selectedDate,
  onSelectDate,
  onUpdateSettings,
  onToast,
}: ScreenProps) {
  const [draft, setDraft] = useState<EntryDraft | null>(null)

  const week = weekDates(selectedDate)
  const weekEntries =
    useLiveQuery(
      () => db.entries.where('date').between(week[0]!, week[6]!, true, true).toArray(),
      [week[0], week[6]],
      undefined,
    ) ?? []
  const recent =
    useLiveQuery(() => db.entries.orderBy('updatedAt').reverse().limit(40).toArray(), [], []) ?? []

  const dayEntries = useMemo(
    () =>
      weekEntries
        .filter((entry) => entry.date === selectedDate)
        .sort((a, b) => a.startMinutes - b.startMinutes),
    [weekEntries, selectedDate],
  )

  const filledDates = useMemo(
    () => new Set(weekEntries.map((entry) => entry.date)),
    [weekEntries],
  )

  const dayTotals = useMemo(() => {
    let total = 0
    let extra = 0
    for (const entry of dayEntries) {
      const hours = computeHours(
        entry.startMinutes,
        entry.endMinutes,
        pack?.defaults.contractualDailyMinutes ?? 480,
        entry.extraMinutesOverride,
      )
      total += hours.totalMinutes
      extra += hours.extraMinutes
    }
    return { total, extra }
  }, [dayEntries, pack])

  /** The most recent entry before this day — the basis for "same as yesterday". */
  const previous = useMemo(() => {
    const earlier = recent
      .filter((entry) => entry.date < selectedDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    return earlier[0] ?? null
  }, [recent, selectedDate])

  if (!pack) {
    return (
      <div className="screen">
        <Header t={t} selectedDate={selectedDate} language={settings.language} />
        <div className="screen-pad">
          <Empty title={t.needCompanyFileTitle} hint={t.needCompanyFileBody} />
        </div>
      </div>
    )
  }

  const blankDraft = (): EntryDraft => ({
    id: null,
    date: selectedDate,
    startMinutes: settings.lastStartMinutes || pack.defaults.startMinutes,
    endMinutes: settings.lastEndMinutes || pack.defaults.endMinutes,
    extraMinutesOverride: null,
    project: settings.lastProject || pack.lists.projects[0] || '',
    section: settings.lastSection,
    interventionType: settings.lastInterventionType || pack.lists.interventionTypes[0] || '',
    statusPercent: 100,
    description: '',
    colleagues: [],
  })

  const draftFromEntry = (entry: Entry): EntryDraft => ({
    id: entry.id,
    date: entry.date,
    startMinutes: entry.startMinutes,
    endMinutes: entry.endMinutes,
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
    setDraft({ ...draftFromEntry(previous), id: null, date: selectedDate, description: '' })
  }

  const save = async () => {
    if (!draft) return
    const now = Date.now()
    const existing = draft.id ? await db.entries.get(draft.id) : undefined

    const entry: Entry = {
      id: draft.id ?? newId(),
      date: draft.date,
      startMinutes: draft.startMinutes,
      endMinutes: draft.endMinutes,
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
    // Remember the choices so tomorrow starts from what today looked like.
    await onUpdateSettings({
      lastProject: entry.project,
      lastSection: entry.section,
      lastInterventionType: entry.interventionType,
      lastStartMinutes: entry.startMinutes,
      lastEndMinutes: entry.endMinutes,
      customColleagues: mergeColleagues(settings.customColleagues, entry.colleagues, pack),
    })

    setDraft(null)
    onToast({ message: t.saved, tone: 'ok' })
  }

  const remove = async () => {
    if (!draft?.id) return
    const snapshot = await db.entries.get(draft.id)
    await removeEntry(draft.id)
    setDraft(null)
    onToast({
      message: t.deleted,
      action: snapshot
        ? { label: t.undo, run: () => void putEntry(snapshot) }
        : undefined,
    })
  }

  return (
    <div className="screen">
      <Header t={t} selectedDate={selectedDate} language={settings.language} />
      <WeekStrip
        anchor={selectedDate}
        selected={selectedDate}
        filledDates={filledDates}
        language={settings.language}
        onSelect={onSelectDate}
      />

      <div className="screen-pad">
        {dayEntries.length > 0 ? (
          <>
            <div className="totals" style={{ marginBottom: 14 }}>
              <div className="total">
                <div className="total-value">{formatDuration(dayTotals.total)}</div>
                <div className="total-label">{t.totalHours}</div>
              </div>
              <div className="total">
                <div className="total-value">
                  {formatDuration(dayTotals.total - dayTotals.extra)}
                </div>
                <div className="total-label">{t.normalHours}</div>
              </div>
              <div className="total">
                <div className={`total-value${dayTotals.extra > 0 ? ' accent' : ''}`}>
                  {formatDuration(dayTotals.extra)}
                </div>
                <div className="total-label">{t.extraHours}</div>
              </div>
            </div>

            <div>
              {dayEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  contractualMinutes={pack.defaults.contractualDailyMinutes}
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
        />
      ) : null}
    </div>
  )
}

function Header({
  t,
  selectedDate,
  language,
}: {
  t: ScreenProps['t']
  selectedDate: string
  language: ScreenProps['settings']['language']
}) {
  const isToday = selectedDate === todayISO()
  return (
    <div className="topbar">
      <div>
        <p className="topbar-title">{isToday ? t.today : t.navToday}</p>
        <p className="topbar-sub">{formatLongDate(selectedDate, language)}</p>
      </div>
    </div>
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
    entry.startMinutes,
    entry.endMinutes,
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
          {formatClock(entry.startMinutes)} – {formatClock(entry.endMinutes)}
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

/** Keep hand-typed colleagues around, but never duplicate what the pack already lists. */
function mergeColleagues(
  existing: ScreenProps['settings']['customColleagues'],
  used: Entry['colleagues'],
  pack: NonNullable<ScreenProps['pack']>,
) {
  const fromPack = new Set(pack.lists.colleagues.map((p) => p.name))
  const seen = new Set(existing.map((p) => p.name))
  const out = [...existing]
  for (const person of used) {
    if (fromPack.has(person.name) || seen.has(person.name) || person.name.trim() === '') continue
    seen.add(person.name)
    out.push(person)
  }
  return out.slice(-20)
}
