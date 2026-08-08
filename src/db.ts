/**
 * Local storage.
 *
 * Everything lives in IndexedDB on the technician's own device. There is no server, no
 * account and no synchronisation — data leaves only when someone deliberately exports it.
 */

import Dexie, { type Table } from 'dexie'
import type { CompanyPack, CustomValues, Entry, Person, Settings } from './types'
import { weekDates } from './lib/dates'
import { parsePack } from './lib/pack'

class AppDatabase extends Dexie {
  entries!: Table<Entry, string>
  settings!: Table<Settings, string>
  packs!: Table<CompanyPack, string>

  constructor() {
    super('technician-hours')
    this.version(1).stores({
      entries: 'id, date, updatedAt',
      settings: 'id',
      packs: 'id',
    })
  }
}

export const db = new AppDatabase()

export const EMPTY_PERSON: Person = { name: '', email: '' }

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    technician: { ...EMPTY_PERSON },
    language: 'it',
    lastProject: '',
    lastSection: '',
    lastInterventionType: '',
    lastStartMinutes: 7 * 60,
    lastEndMinutes: 15 * 60,
    customColleagues: [],
    customValues: emptyCustomValues(),
    onboardingComplete: false,
    lastBackupAt: null,
  }
}

export function emptyCustomValues(): CustomValues {
  return { projects: [], sections: [], interventionTypes: [] }
}

export async function loadSettings(): Promise<Settings> {
  const stored = await db.settings.get('settings')
  if (!stored) return defaultSettings()
  // Merged field by field so settings saved before a key existed still load.
  return {
    ...defaultSettings(),
    ...stored,
    customColleagues: stored.customColleagues ?? [],
    customValues: { ...emptyCustomValues(), ...(stored.customValues ?? {}) },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, id: 'settings' })
}

/**
 * Read the stored pack, re-validating it on the way out.
 *
 * Running it back through the parser means a pack imported by an older version of the app
 * picks up new defaults automatically. Without this, a technician carrying a pack from
 * before a settings change keeps producing reports with the old behaviour and has no way
 * of knowing — the file would simply be quietly wrong.
 */
export async function loadPack(): Promise<CompanyPack | undefined> {
  const stored = await db.packs.get('pack')
  if (!stored) return undefined
  try {
    return { ...parsePack(stored), id: 'pack', installedAt: stored.installedAt }
  } catch {
    // An unreadable pack is still better than none: the app degrades rather than
    // pretending the technician never installed one.
    return stored
  }
}

export async function savePack(pack: CompanyPack): Promise<void> {
  await db.packs.put({ ...pack, id: 'pack' })
}

export async function clearPack(): Promise<void> {
  await db.packs.delete('pack')
}

export async function entriesForWeek(anchor: string): Promise<Entry[]> {
  const days = weekDates(anchor)
  return db.entries
    .where('date')
    .between(days[0]!, days[6]!, true, true)
    .toArray()
}

export async function entriesForDay(date: string): Promise<Entry[]> {
  return db.entries.where('date').equals(date).toArray()
}

export async function entriesBetween(from: string, to: string): Promise<Entry[]> {
  return db.entries.where('date').between(from, to, true, true).toArray()
}

export async function allEntries(): Promise<Entry[]> {
  return db.entries.orderBy('date').toArray()
}

export async function putEntry(entry: Entry): Promise<void> {
  await db.entries.put(entry)
}

export async function deleteEntry(id: string): Promise<void> {
  await db.entries.delete(id)
}

/**
 * Ask the browser to keep this data when it starts reclaiming space.
 *
 * Best-effort: the answer depends on the browser and on whether the app has been
 * installed. It is worth asking, because for most technicians this database is the only
 * copy of their month.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export function newId(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
