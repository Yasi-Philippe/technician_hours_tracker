/**
 * Settings, backup, and the one dangerous button.
 *
 * Backup is placed above everything else on purpose. Browser storage can be cleared without
 * warning, so the export file is not a convenience — for most technicians it is the only
 * copy of their month that exists anywhere.
 */

import { useEffect, useRef, useState } from 'react'
import type { Language } from '../types'
import type { ScreenProps } from './shared'
import { LANGUAGE_NAMES } from '../i18n'
import { Card, Credit, Field, downloadBlob } from '../components/ui'
import { PackLoader } from '../components/PackLoader'
import { clearPack, db, requestPersistentStorage } from '../db'
import {
  BackupError,
  backupFileName,
  buildBackup,
  mergeBackup,
  parseBackup,
} from '../lib/backup'
import { PackError, describePack, parsePack } from '../lib/pack'
import { savePack } from '../db'
import { formatShortDate, toISODate } from '../lib/dates'

export default function SettingsScreen({
  settings,
  pack,
  t,
  onUpdateSettings,
  onToast,
  entryCount,
}: ScreenProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [replacingPack, setReplacingPack] = useState(false)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  const exportBackup = async () => {
    const backup = await buildBackup(true)
    downloadBlob(
      new Blob([JSON.stringify(backup)], { type: 'application/json' }),
      backupFileName(settings.technician),
    )
    await onUpdateSettings({ lastBackupAt: Date.now() })
    onToast({ message: t.saved, tone: 'ok' })
  }

  const importBackup = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const backup = parseBackup(JSON.parse(await file.text()))
      const result = await mergeBackup(backup)

      // A backup carries the pack too, so a replacement phone is usable after one import.
      if (backup.pack && !pack) {
        try {
          await savePack({ ...parsePack(backup.pack), id: 'pack', installedAt: Date.now() })
        } catch {
          // A damaged pack inside a backup must not cost the technician their entries.
        }
      }

      onToast({
        message: `${result.added + result.updated} ${t.importedEntries}`,
        tone: 'ok',
      })
    } catch (cause) {
      if (cause instanceof BackupError) setError(cause.message)
      else if (cause instanceof PackError) setError(cause.message)
      else if (cause instanceof SyntaxError) setError(t.errorFileNotRead)
      else setError(t.errorTitle)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  const deleteEverything = async () => {
    if (!window.confirm(t.deleteAllConfirm)) return
    await db.entries.clear()
    onToast({ message: t.deleteAllDone })
  }

  const removePack = async () => {
    if (!window.confirm(t.removeCompanyFileConfirm)) return
    await clearPack()
  }

  const staleBackup =
    settings.lastBackupAt === null || Date.now() - settings.lastBackupAt > 9 * 86_400_000

  return (
    <div className="screen">
      <div className="topbar">
        <div>
          <p className="topbar-title">{t.appName}</p>
          <p className="topbar-sub">{t.navSettings}</p>
        </div>
      </div>

      <div className="screen-pad">
        <Card title={t.backupTitle}>
          <p className="hint" style={{ marginTop: 0 }}>
            {t.backupBody}
          </p>
          {staleBackup && entryCount > 0 ? <p className="error">{t.backupReminder}</p> : null}
          <div className="stack" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => void exportBackup()}
              disabled={entryCount === 0}
            >
              {t.backupExport}
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => void importBackup(e.target.files?.[0])}
            />
            <button type="button" className="btn" onClick={() => importRef.current?.click()}>
              {t.backupImport}
            </button>
          </div>
          <div className="rows" style={{ marginTop: 12 }}>
            <div className="row row-static">
              <span className="row-label">{t.backupLast}</span>
              <span className="row-value">
                {settings.lastBackupAt
                  ? formatShortDate(toISODate(new Date(settings.lastBackupAt)))
                  : t.backupNever}
              </span>
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </Card>

        <Card title={t.technician}>
          <Field label={t.yourName}>
            <input
              className="input"
              value={settings.technician.name}
              onChange={(e) =>
                void onUpdateSettings({
                  technician: { ...settings.technician, name: e.target.value },
                })
              }
            />
          </Field>
          <Field label={t.yourEmail}>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              value={settings.technician.email}
              onChange={(e) =>
                void onUpdateSettings({
                  technician: { ...settings.technician, email: e.target.value },
                })
              }
            />
          </Field>
        </Card>

        <Card title={t.language}>
          <div className="options cols-2">
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                className={`option${settings.language === code ? ' is-selected' : ''}`}
                onClick={() => void onUpdateSettings({ language: code })}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
        </Card>

        <Card title={t.companyFile}>
          {pack ? (
            <div className="rows">
              <div className="row row-static">
                <span className="row-label">{describePack(pack)}</span>
                <span className="row-value">
                  {pack.lists.projects.length} · {pack.lists.interventionTypes.length}
                </span>
              </div>
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 0 }}>
              {t.companyFileNone}
            </p>
          )}

          {replacingPack || !pack ? (
            <div style={{ marginTop: 12 }}>
              <PackLoader
                t={t}
                label={t.loadCompanyFile}
                onLoaded={() => {
                  setReplacingPack(false)
                  onToast({ message: t.companyFileLoaded, tone: 'ok' })
                }}
              />
            </div>
          ) : (
            <div className="stack" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setReplacingPack(true)}>
                {t.replaceCompanyFile}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void removePack()}>
                {t.removeCompanyFile}
              </button>
            </div>
          )}
        </Card>

        <Card title={t.storage}>
          <p className="hint" style={{ marginTop: 0 }}>
            {persisted ? t.storagePersisted : t.storageNotPersisted}
          </p>
          {persisted === false ? (
            <button
              type="button"
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => void requestPersistentStorage().then(setPersisted)}
            >
              {t.installApp}
            </button>
          ) : null}
        </Card>

        <Card title={t.dangerZone}>
          <button type="button" className="btn btn-danger" onClick={() => void deleteEverything()}>
            {t.deleteAll}
          </button>
        </Card>

        <Credit text={t.credit} />
      </div>
    </div>
  )
}
