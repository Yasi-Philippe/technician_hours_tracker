/**
 * What the technician sees when the Excel needs a company file that is not there.
 *
 * A disabled button would be a dead end: it says no without saying why, and gives no way
 * forward. This explains what is missing, lets the file be loaded on the spot, and — for
 * the case where the file is loaded and something is still wrong — says who to ask.
 */

import type { Strings } from '../i18n'
import { Sheet } from './ui'
import { PackLoader } from './PackLoader'

export function PackRequired({ t, onClose }: { t: Strings; onClose: () => void }) {
  return (
    <Sheet
      title={t.exportNeedsPackTitle}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-lg" onClick={onClose}>
          {t.close}
        </button>
      }
    >
      <p style={{ marginTop: 0, fontSize: 17, lineHeight: 1.5 }}>{t.exportNeedsPackBody}</p>
      <div style={{ marginTop: 18 }}>
        <PackLoader t={t} label={t.loadCompanyFile} onLoaded={onClose} />
      </div>
      <p className="hint" style={{ marginTop: 18 }}>
        {t.exportNeedsPackAdmin}
      </p>
    </Sheet>
  )
}
