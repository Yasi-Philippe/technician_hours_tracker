import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { db, requestPersistentStorage } from './db'
import './styles.css'

/**
 * The markup shown before the app mounts, and left in place if it never does.
 *
 * A technician staring at a white screen has nothing to report and nothing to try. Any
 * failure that stops the app — a script that will not parse, a database that will not
 * open — should end up written here where it can at least be read out over the phone.
 */
const boot = document.getElementById('boot')

function fail(what: string, detail: unknown): void {
  if (!boot) return
  const message = detail instanceof Error ? detail.message : String(detail ?? '')
  boot.className = 'is-error'
  boot.innerHTML = ''

  const mark = document.createElement('div')
  mark.className = 'boot-mark'
  const title = document.createElement('p')
  title.className = 'boot-title'
  title.textContent = what
  const text = document.createElement('p')
  text.className = 'boot-text'
  // textContent, never innerHTML: this string can come from anywhere.
  text.textContent = message
  boot.append(mark, title, text)
}

// Anything thrown before or during the first render still reaches the screen.
window.addEventListener('error', (event) => fail('Errore', event.message))
window.addEventListener('unhandledrejection', (event) => fail('Errore', event.reason))

/*
 * Open the database explicitly rather than letting the first query do it.
 *
 * A failed open is otherwise indistinguishable from one that is merely slow — both leave
 * every query pending forever — and the app would sit on its loading state for good.
 */
db.open().catch((cause) => {
  fail('Impossibile aprire i dati su questo telefono', cause)
})

// Asked once, early. For most technicians this database is the only copy of their month.
void requestPersistentStorage()

try {
  const container = document.getElementById('root')
  if (!container) throw new Error('#root is missing from the page')

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // The app is up; the fallback has done its job.
  boot?.remove()
} catch (cause) {
  fail('Impossibile avviare l’app', cause)
}
