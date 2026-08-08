/**
 * Backup and transfer.
 *
 * One file carries everything: the entries, and optionally the company pack, so a new
 * phone is fully working after a single import. The same file is both the backup and the
 * way a colleague's data reaches a team lead's device.
 *
 * Browser storage can be cleared without warning, so this file is not a convenience —
 * for most technicians it is the only copy of their month that exists anywhere.
 */

import type { BackupFile, CompanyPack, Entry, Person } from '../types'
import { allEntries, db, loadPack, loadSettings } from '../db'

export const BACKUP_FORMAT_VERSION = 1
const BACKUP_KIND = 'technician-hours-backup'

export class BackupError extends Error {}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  packInstalled: boolean
}

export async function buildBackup(includePack: boolean): Promise<BackupFile> {
  const [entries, settings, pack] = await Promise.all([allEntries(), loadSettings(), loadPack()])
  return {
    kind: BACKUP_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    exportedBy: settings.technician,
    entries,
    pack: includePack && pack ? stripPackKey(pack) : null,
  }
}

function stripPackKey(pack: CompanyPack): BackupFile['pack'] {
  const { id: _id, installedAt: _installedAt, ...rest } = pack
  return rest
}

export function parseBackup(json: unknown): BackupFile {
  if (typeof json !== 'object' || json === null) {
    throw new BackupError('This file is not a backup')
  }
  const raw = json as Record<string, unknown>
  if (raw.kind !== BACKUP_KIND) {
    throw new BackupError('This file is not a backup from this app')
  }
  if (raw.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError('This backup was made by a different version of the app')
  }
  if (!Array.isArray(raw.entries)) {
    throw new BackupError('This backup contains no reports')
  }

  return {
    kind: BACKUP_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : Date.now(),
    exportedBy: parsePerson(raw.exportedBy),
    entries: raw.entries.map(parseEntry).filter((e): e is Entry => e !== null),
    pack: (raw.pack ?? null) as BackupFile['pack'],
  }
}

function parsePerson(value: unknown): Person {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    email: typeof raw.email === 'string' ? raw.email : '',
  }
}

function parseEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.date !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null

  const number = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const string = (v: unknown) => (typeof v === 'string' ? v : '')

  return {
    id: raw.id,
    date: raw.date,
    startMinutes: number(raw.startMinutes, 0),
    endMinutes: number(raw.endMinutes, 0),
    extraMinutesOverride:
      typeof raw.extraMinutesOverride === 'number' ? raw.extraMinutesOverride : null,
    project: string(raw.project),
    section: string(raw.section),
    interventionType: string(raw.interventionType),
    statusPercent: number(raw.statusPercent, 100),
    description: string(raw.description),
    technician: parsePerson(raw.technician),
    colleagues: Array.isArray(raw.colleagues) ? raw.colleagues.map(parsePerson) : [],
    createdAt: number(raw.createdAt, Date.now()),
    updatedAt: number(raw.updatedAt, Date.now()),
  }
}

/**
 * Merge an imported backup into the local database.
 *
 * Entries are matched by id and the more recently edited copy wins, so importing the same
 * file twice changes nothing and two devices can be merged in either order. Nothing is
 * ever deleted by an import.
 */
export async function mergeBackup(backup: BackupFile): Promise<ImportResult> {
  let added = 0
  let updated = 0
  let skipped = 0

  await db.transaction('rw', db.entries, async () => {
    for (const entry of backup.entries) {
      const existing = await db.entries.get(entry.id)
      if (!existing) {
        await db.entries.put(entry)
        added++
      } else if (entry.updatedAt > existing.updatedAt) {
        await db.entries.put(entry)
        updated++
      } else {
        skipped++
      }
    }
  })

  return { added, updated, skipped, packInstalled: false }
}

export function backupFileName(person: Person, at = new Date()): string {
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  const name =
    person.name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'dati'
  return `${name}_${stamp}.json`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
