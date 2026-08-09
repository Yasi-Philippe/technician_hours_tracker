import type { CompanyPack, CustomValues, Entry, Person, Settings } from '../types'
import type { Strings } from '../i18n'
import type { ToastState } from '../components/ui'

/** What every screen receives. Kept in one place so the shell stays readable. */
export interface ScreenProps {
  settings: Settings
  pack: CompanyPack | null
  t: Strings
  selectedDate: string
  onSelectDate: (date: string) => void
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  onToast: (toast: ToastState) => void
  entryCount: number
}

/**
 * The choices for a field, in the order the pack lists them — always.
 *
 * An earlier version promoted the last-used value to the front, which meant tapping the
 * third option slid it into second place while the finger was still on it. Buttons that
 * move as you press them make a list feel broken, and for someone who learns this screen
 * by position it is worse than that.
 *
 * Nothing is gained by reordering anyway: the likely value is already preselected, so it
 * never has to be hunted for. A value that is not in the pack — a retired project on an
 * old entry — is appended rather than dropped, so it stays visible without displacing
 * anything.
 */
export function optionsWith(options: string[], current: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of [...options, current]) {
    const trimmed = value.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/**
 * Descriptions the technician has actually written, most recent first, deduplicated.
 *
 * Capped deliberately. These are shown in full rather than truncated, so an uncapped
 * list would turn into a wall of text and reading it would cost more than retyping.
 */
export function recentDescriptions(entries: Entry[], limit = 8): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of [...entries].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const value = entry.description.trim()
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Remembered values
// ---------------------------------------------------------------------------

/**
 * How many hand-typed values are kept per list.
 *
 * Generous, because forgetting something a technician typed is worse than a long list —
 * but bounded, so a year of typos cannot grow without limit.
 */
const REMEMBER_LIMIT = 30

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Remember a value the technician typed by hand.
 *
 * Anything the pack already offers is ignored: the company's own lists are not
 * duplicated into the technician's. Case and stray spaces are treated as the same value,
 * so the same word typed twice with different capitals does not become two entries.
 */
export function rememberValue(existing: string[], value: string, fromPack: string[]): string[] {
  const trimmed = value.trim()
  if (trimmed === '') return existing
  if (fromPack.some((option) => sameText(option, trimmed))) return existing
  if (existing.some((option) => sameText(option, trimmed))) return existing
  return [...existing, trimmed].slice(-REMEMBER_LIMIT)
}

/** Drop a remembered value. Entries that already use it keep their own copy. */
export function forgetValue(existing: string[], value: string): string[] {
  return existing.filter((option) => !sameText(option, value))
}

export function rememberPerson(existing: Person[], person: Person, fromPack: Person[]): Person[] {
  const name = person.name.trim()
  if (name === '') return existing
  if (fromPack.some((other) => sameText(other.name, name))) return existing
  if (existing.some((other) => sameText(other.name, name))) return existing
  return [...existing, { name, email: person.email }].slice(-REMEMBER_LIMIT)
}

export function forgetPerson(existing: Person[], name: string): Person[] {
  return existing.filter((person) => !sameText(person.name, name))
}

/** The pack's list followed by whatever the technician has added to it. */
export function mergedOptions(fromPack: string[], custom: string[]): string[] {
  const seen = new Set(fromPack.map((option) => option.trim().toLowerCase()))
  return [...fromPack, ...custom.filter((option) => !seen.has(option.trim().toLowerCase()))]
}

export function mergedPeople(fromPack: Person[], custom: Person[]): Person[] {
  const seen = new Set(fromPack.map((person) => person.name.trim().toLowerCase()))
  return [...fromPack, ...custom.filter((person) => !seen.has(person.name.trim().toLowerCase()))]
}

/**
 * What the entry form needs, whether or not a company file has been loaded.
 *
 * Without a pack the app still records hours — it just has no lists to offer and no
 * template to export into. Recording the work is the part a technician cannot postpone;
 * the spreadsheet can wait until the file arrives.
 *
 * Hand-typed values are remembered, so someone working without a pack builds up their
 * own lists as they go and the app becomes progressively less bare.
 */
export interface EntrySetup {
  projects: string[]
  sections: string[]
  interventionTypes: string[]
  colleagues: Person[]
  startMinutes: number
  endMinutes: number
  contractualDailyMinutes: number
  emptySectionText: string
}

/** Used when no company file has been loaded. */
const WITHOUT_PACK = {
  startMinutes: 7 * 60,
  endMinutes: 15 * 60,
  contractualDailyMinutes: 8 * 60,
  emptySectionText: 'N/A',
}

export function entrySetup(pack: CompanyPack | null, settings: Settings): EntrySetup {
  return {
    projects: mergedOptions(pack?.lists.projects ?? [], settings.customValues.projects),
    sections: mergedOptions(pack?.lists.sections ?? [], settings.customValues.sections),
    interventionTypes: mergedOptions(
      pack?.lists.interventionTypes ?? [],
      settings.customValues.interventionTypes,
    ),
    colleagues: mergedPeople(pack?.lists.colleagues ?? [], settings.customColleagues).filter(
      (person) => person.name.trim() !== settings.technician.name.trim(),
    ),
    startMinutes: pack?.defaults.startMinutes ?? WITHOUT_PACK.startMinutes,
    endMinutes: pack?.defaults.endMinutes ?? WITHOUT_PACK.endMinutes,
    contractualDailyMinutes:
      pack?.defaults.contractualDailyMinutes ?? WITHOUT_PACK.contractualDailyMinutes,
    emptySectionText: pack?.sheet.emptySectionText ?? WITHOUT_PACK.emptySectionText,
  }
}

/** Everything the technician has added, for the management screen. */
export function customCounts(settings: Settings): number {
  const { projects, sections, interventionTypes } = settings.customValues
  return (
    projects.length + sections.length + interventionTypes.length + settings.customColleagues.length
  )
}

export function emptyCustom(): CustomValues {
  return { projects: [], sections: [], interventionTypes: [] }
}

/** Remember every hand-typed value from a saved entry, in one pass. */
export function rememberFromEntry(
  settings: Settings,
  entry: Pick<Entry, 'project' | 'section' | 'interventionType' | 'colleagues'>,
  pack: CompanyPack | null,
): Pick<Settings, 'customValues' | 'customColleagues'> {
  const fromPack = pack?.lists ?? {
    projects: [],
    sections: [],
    interventionTypes: [],
    colleagues: [],
  }

  let colleagues = settings.customColleagues
  for (const person of entry.colleagues) {
    colleagues = rememberPerson(colleagues, person, fromPack.colleagues)
  }
  return {
    customValues: {
      projects: rememberValue(settings.customValues.projects, entry.project, fromPack.projects),
      sections: rememberValue(settings.customValues.sections, entry.section, fromPack.sections),
      interventionTypes: rememberValue(
        settings.customValues.interventionTypes,
        entry.interventionType,
        fromPack.interventionTypes,
      ),
    },
    customColleagues: colleagues,
  }
}
