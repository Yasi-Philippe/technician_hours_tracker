import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'

const base = {
  kind: 'technician-hours-backup',
  formatVersion: 1,
  exportedAt: 1,
  exportedBy: { name: 'Mario Rossi', email: 'mario@example.test' },
  pack: null,
}

const entry = (extra: Record<string, unknown>) => ({
  id: 'e1',
  date: '2026-08-03',
  extraMinutesOverride: null,
  project: 'P',
  section: '',
  interventionType: 'T',
  statusPercent: 100,
  description: 'd',
  technician: { name: 'Mario Rossi', email: '' },
  colleagues: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})

describe('restoring a backup', () => {
  it('reads a file written before hours became a list of stretches', () => {
    // Old shape: one start and one end on the entry itself.
    const backup = parseBackup({
      ...base,
      entries: [entry({ startMinutes: 420, endMinutes: 900 })],
    })
    expect(backup.entries[0]!.segments).toEqual([{ startMinutes: 420, endMinutes: 900 }])
  })

  it('reads a file with several stretches', () => {
    const backup = parseBackup({
      ...base,
      entries: [
        entry({
          segments: [
            { startMinutes: 420, endMinutes: 900 },
            { startMinutes: 1020, endMinutes: 1140 },
          ],
        }),
      ],
    })
    expect(backup.entries[0]!.segments).toHaveLength(2)
    expect(backup.entries[0]!.segments[1]).toEqual({ startMinutes: 1020, endMinutes: 1140 })
  })

  it('never leaves an entry without a stretch', () => {
    // A damaged or hand-edited file must not produce an entry the app cannot total.
    const backup = parseBackup({ ...base, entries: [entry({ segments: [] })] })
    expect(backup.entries[0]!.segments).toHaveLength(1)
  })

  it('rejects a file that is not a backup', () => {
    expect(() => parseBackup({ kind: 'something-else' })).toThrow()
    expect(() => parseBackup(null)).toThrow()
  })
})
