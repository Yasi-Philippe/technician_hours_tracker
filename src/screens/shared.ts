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
