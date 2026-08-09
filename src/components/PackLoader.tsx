/**
 * Loading the company file.
 *
 * This is the one moment where company data enters the app, and it is a file picker and
 * nothing more — no URL to type, no server to reach, no code to paste. Whatever comes back
 * is validated before it is stored, and failures say what to do rather than what broke.
 */

import { useRef, useState } from 'react'
import type { Strings } from '../i18n'
import { PackError, describePack, parsePack } from '../lib/pack'
import { loadPack, savePack } from '../db'
import { useLiveQuery } from 'dexie-react-hooks'

export function PackLoader({
  t,
  label,
  onLoaded,
}: {
  t: Strings
  label: string
  onLoaded?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const pack = useLiveQuery(loadPack, [], undefined)

  const handle = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const parsed = parsePack(JSON.parse(await file.text()))
      await savePack({ ...parsed, id: 'pack', installedAt: Date.now() })
      onLoaded?.()
    } catch (cause) {
      if (cause instanceof PackError) {
        setError({ message: cause.message, detail: cause.detail })
      } else if (cause instanceof SyntaxError) {
        setError({ message: t.errorFileNotRead })
      } else {
        setError({ message: t.errorTitle })
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="stack">
      {/*
        No `accept` filter on purpose.

        Android's document picker filters by MIME type, and a file that arrived through
        WhatsApp or e-mail is stored as application/octet-stream — so a filter of
        "application/json" hides the very file the technician was sent, with nothing on
        screen to explain why. The contents are validated on load anyway, so a wrong file
        gets a message rather than a mystery.
      */}
      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>

      {pack ? (
        <div className="rows">
          <div className="row row-static">
            <span className="row-label">{t.companyFileLoaded}</span>
            <span className="row-value">{describePack(pack)}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="error">
          {error.message}
          {error.detail ? <><br />{error.detail}</> : null}
        </p>
      ) : null}
    </div>
  )
}
