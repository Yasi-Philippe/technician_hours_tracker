import type { CompanyPack, Entry, Settings } from '../types'
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
 * Put the value someone reached for last at the front of the list.
 *
 * Most technicians work the same project for weeks, so alphabetical order would put the
 * right answer in an arbitrary place. Anything not in the pack is kept too — a retired
 * project must not vanish from an entry that already references it.
 */
export function orderByRecent(options: string[], ...recent: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of [...recent, ...options]) {
    const trimmed = value.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/** Descriptions the technician has actually written, most recent first. */
export function recentDescriptions(entries: Entry[], limit = 6): string[] {
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
