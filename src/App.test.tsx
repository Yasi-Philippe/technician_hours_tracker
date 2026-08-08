// @vitest-environment happy-dom

/**
 * End-to-end smoke tests over the real components and a real (in-memory) IndexedDB.
 *
 * These exist because the parts that matter here are the ones a type checker cannot see:
 * that the app mounts at all, that a technician can get from a blank install to a saved
 * entry, and that the hours a person types are the hours that reach the spreadsheet.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { unzipSync, strFromU8 } from 'fflate'
import { lazy, templateBytes, withTemplate } from './testing/template'
import App from './App'
import { db, loadSettings, savePack, saveSettings, defaultSettings } from './db'
import { bytesToBase64 } from './lib/base64'
import type { CompanyPack } from './types'

function testPack(templateBase64: string): CompanyPack {
  return {
    id: 'pack',
    formatVersion: 1,
    packVersion: '1',
    label: 'Test Site',
    templateBase64,
    sheet: {
      dataStartRow: 10,
      columns: {
        date: 0, month: 1, week: 2, project: 3, section: 4, interventionType: 5,
        statusPercent: 6, description: 7, impresa: 8, cliente: 9, technicianName: 10,
        technicianEmail: 11, startTime: 12, endTime: 13, totalHours: 14,
        normalHours: 15, extraHours: 16,
      },
      timeFormat: 'fraction',
      totalFormat: 'fraction',
      hoursFormat: 'decimal',
      percentScale: 1,
      uppercaseMonth: true,
      emptySectionText: 'N/A',
    },
    constants: { impresa: 'IMPRESA X', cliente: 'CLIENTE Y' },
    lists: {
      projects: ['PARCO NORD', 'PARCO SUD'],
      sections: ['A1', 'B2'],
      interventionTypes: ['Conservazione parco', 'Correttivo', 'Preventivo'],
      colleagues: [{ name: 'Ana Lopez', email: 'ana@example.test' }],
    },
    defaults: { startMinutes: 420, endMinutes: 900, contractualDailyMinutes: 480 },
    emailDomain: '@example.test',
    fileNamePattern: 'Report_S{week}_{year}_{name}',
    installedAt: 0,
  }
}

async function resetDatabase() {
  await db.entries.clear()
  await db.settings.clear()
  await db.packs.clear()
}

beforeEach(resetDatabase)
afterEach(cleanup)

describe('a blank install', () => {
  it('opens on the welcome step and asks for a language', async () => {
    render(<App />)
    expect(await screen.findByText('Benvenuto')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Italiano' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Español' })).toBeTruthy()
  })

  it('switches the whole interface to Spanish when asked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Benvenuto')
    await user.click(screen.getByRole('button', { name: 'Español' }))
    expect(await screen.findByText('Bienvenido')).toBeTruthy()
  })

  it('lets a technician start without the company file', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Benvenuto')

    await user.click(screen.getByRole('button', { name: 'Continua' }))
    await user.type(await screen.findByPlaceholderText('Nome e cognome'), 'Mario Rossi')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    // No file yet, so the step offers to move on rather than blocking.
    const skip = await screen.findByRole('button', { name: 'Per ora salta' })
    expect((skip as HTMLButtonElement).disabled).toBe(false)
    await user.click(skip)

    // Straight into the app, able to record hours.
    expect(await screen.findByRole('button', { name: 'Aggiungi' })).toBeTruthy()
  })

  it('records a full day with no company file at all', async () => {
    const user = userEvent.setup()
    await saveSettings({
      ...defaultSettings(),
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      onboardingComplete: true,
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    // Falls back to the standard shift even with no pack to declare one.
    expect(await screen.findByDisplayValue('07:00')).toBeTruthy()
    expect(screen.getByDisplayValue('15:00')).toBeTruthy()

    // No lists to offer, so everything is typed — and remembered for next time.
    await user.click((await screen.findAllByRole('button', { name: 'Altro…' }))[0]!)
    await user.type(document.querySelector('.stack input.input') as HTMLInputElement, 'PARCO OVEST')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.project).toBe('PARCO OVEST')
    expect((await loadSettings()).customValues.projects).toEqual(['PARCO OVEST'])
  })

  it('explains what is missing instead of a dead export button', async () => {
    const user = userEvent.setup()
    await saveSettings({
      ...defaultSettings(),
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      onboardingComplete: true,
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(screen.getByRole('button', { name: /Calendario/ }))
    const exportButton = await screen.findByRole('button', { name: 'Crea il file Excel' })
    // Enabled, so tapping it can explain rather than silently doing nothing.
    expect((exportButton as HTMLButtonElement).disabled).toBe(false)
    await user.click(exportButton)

    expect(await screen.findByText('Prima serve il file aziendale')).toBeTruthy()
    // Loadable on the spot, and it says who to ask if that does not help.
    expect(screen.getByRole('button', { name: 'Apri il file aziendale' })).toBeTruthy()
    expect(screen.getByText(/contatta l’amministratore/)).toBeTruthy()
  })

  it('refuses to continue without a name', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Benvenuto')
    await user.click(screen.getByRole('button', { name: 'Continua' }))
    await screen.findByPlaceholderText('Nome e cognome')
    await user.click(screen.getByRole('button', { name: 'Continua' }))
    expect(await screen.findByText('Scrivi il tuo nome per continuare')).toBeTruthy()
  })
})

// Deferred: a skipped suite still runs its body, and the template is absent in CI.
const templateBase64 = lazy(() => bytesToBase64(templateBytes()))

withTemplate('a configured install', () => {
  beforeEach(async () => {
    await savePack(testPack(templateBase64()))
    await saveSettings({
      ...defaultSettings(),
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      onboardingComplete: true,
    })
  })

  it('lands on today with the defaults already filled in', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    // The preselected shift is the one the pack declares, ready to save untouched.
    expect(await screen.findByDisplayValue('07:00')).toBeTruthy()
    expect(screen.getByDisplayValue('15:00')).toBeTruthy()
    // Eight hours, no overtime — the readout says so before anything is saved.
    expect(screen.getByText('8h')).toBeTruthy()
  })

  it('saves a standard day in two taps and shows it on the day screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.startMinutes).toBe(420)
    expect(entry!.endMinutes).toBe(900)
    expect(entry!.project).toBe('PARCO NORD')
    expect(entry!.technician.name).toBe('Mario Rossi')
    expect(await screen.findByText('07:00 – 15:00')).toBeTruthy()
  })

  it('works out overtime from the end time without ever asking for it', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    const end = await screen.findByDisplayValue('15:00')
    await user.clear(end)
    await user.type(end, '17:30')
    await user.tab()

    // 10h30 worked: 8 normal, 2h30 overtime, shown live.
    expect(await screen.findByText('10h 30')).toBeTruthy()
    expect(screen.getByText(/2h 30/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.endMinutes).toBe(17 * 60 + 30)
    expect(entry!.extraMinutesOverride).toBeNull()
  })

  it('starts in automatic mode and says so', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    const auto = await screen.findByRole('button', { name: 'Automatico' })
    const manual = screen.getByRole('button', { name: 'Manuale' })
    expect(auto.getAttribute('aria-pressed')).toBe('true')
    expect(manual.getAttribute('aria-pressed')).toBe('false')
    // The explanation names the contractual day rather than hardcoding "8".
    expect(screen.getByText(/Calcolate da sole.*8h/)).toBeTruthy()
  })

  it('carries the calculated overtime across when switching to manual', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    const end = await screen.findByDisplayValue('15:00')
    await user.clear(end)
    await user.type(end, '17:00')
    await user.tab()

    // Two hours of overtime were calculated; switching to manual must not reset to zero.
    await user.click(screen.getByRole('button', { name: 'Manuale' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.extraMinutesOverride).toBe(120)
  })

  it('goes back to automatic and forgets the manual figure', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    await user.click(screen.getByRole('button', { name: 'Manuale' }))
    await user.click(screen.getByRole('button', { name: 'Ore extra +30' }))
    await user.click(screen.getByRole('button', { name: 'Automatico' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.extraMinutesOverride).toBeNull()
  })

  it('names overtime instead of appending it, so the total is not misread', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    const end = await screen.findByDisplayValue('15:00')
    await user.clear(end)
    await user.type(end, '16:00')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    // 9 hours worked, 1 of them overtime. "9h +1h" would read as ten.
    const card = (await screen.findByText('07:00 – 16:00')).closest('.entry')!
    const hours = card.querySelector('.entry-hours')!.textContent!.replace(/\s+/g, ' ').trim()
    expect(hours).toBe('9h (1h extra)')
    expect(hours).not.toContain('+')
  })

  it('shows no overtime note on a normal day', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Salva' }))

    const card = (await screen.findByText('07:00 – 15:00')).closest('.entry')!
    expect(card.querySelector('.entry-hours')!.textContent!.trim()).toBe('8h')
  })

  it('lays short codes out in a grid and wordy labels full width', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    const gridOf = (label: string) =>
      screen.getByRole('button', { name: label }).parentElement!.className

    // "PB01" style codes: four across, so thirteen of them are not a long scroll.
    expect(gridOf('A1')).toContain('cols-4')
    // "Conservazione parco" needs the full width to stay readable.
    expect(gridOf('Conservazione parco')).toContain('cols-1')
    // "LATERA/PIANSANO" length projects also stay full width.
    expect(gridOf('PARCO NORD')).toContain('cols-2')
  })

  it('never moves an option when it is selected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    const order = () =>
      ['Conservazione parco', 'Correttivo', 'Preventivo'].map((label) =>
        Array.from(document.querySelectorAll('.option')).indexOf(
          screen.getByRole('button', { name: label }),
        ),
      )

    const before = order()
    // The third option is the one that used to jump into second place when tapped.
    await user.click(screen.getByRole('button', { name: 'Preventivo' }))
    expect(order()).toEqual(before)

    await user.click(screen.getByRole('button', { name: 'Conservazione parco' }))
    expect(order()).toEqual(before)
  })

  it('keeps the pack order even after a different value was used last', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Use the last option, save, then reopen: the list must look the way it always does.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Preventivo' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    const labels = Array.from(document.querySelectorAll('.option'))
      .map((el) => el.textContent)
      .filter((text) => text && ['Conservazione parco', 'Correttivo', 'Preventivo'].includes(text))
    expect(labels).toEqual(['Conservazione parco', 'Correttivo', 'Preventivo'])
  })

  it('remembers the choices so the next day starts from the last one', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'PARCO SUD' }))
    await user.click(await screen.findByRole('button', { name: 'Preventivo' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect((await loadSettings()).lastProject).toBe('PARCO SUD'))
    expect((await loadSettings()).lastInterventionType).toBe('Preventivo')
  })

  it('offers undo instead of a confirmation when a report is deleted', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(await screen.findByText('07:00 – 15:00'))
    await user.click(await screen.findByRole('button', { name: 'Elimina' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(0))

    await user.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
  })

  it('carries a colleague into the entry', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Ana Lopez' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.colleagues.map((p) => p.name)).toEqual(['Ana Lopez'])
  })

  it('keeps past descriptions out of the way until they are asked for', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Nothing written yet, so there is nothing to reuse and no button at all.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    expect(screen.queryByRole('button', { name: 'Usa una descrizione già scritta' })).toBeNull()

    await user.type(
      await screen.findByPlaceholderText('Cosa hai fatto?'),
      'Sostituzione inverter in cabina PB09',
    )
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    // Now there is history — but it stays behind a tap rather than sitting on screen.
    // (The text is on the saved entry card too, so check the picker list specifically.)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    expect(document.querySelectorAll('.reuse-item')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Usa una descrizione già scritta' }))
    // Shown in full, not truncated, so two similar entries can be told apart.
    const option = await screen.findByRole('button', {
      name: 'Sostituzione inverter in cabina PB09',
    })
    await user.click(option)

    expect(
      (screen.getByPlaceholderText('Cosa hai fatto?') as HTMLTextAreaElement).value,
    ).toBe('Sostituzione inverter in cabina PB09')
    // Picking one closes the list again.
    expect(screen.getByRole('button', { name: 'Usa una descrizione già scritta' })).toBeTruthy()
  })

  it('offers each past description once, most recent first', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    // Two entries share a description; a third is older.
    await db.entries.bulkPut(
      ['Ripetuta', 'Ripetuta', 'Più vecchia'].map((description, i) => ({
        id: `seed-${i}`,
        date: '2026-08-03',
        startMinutes: 420,
        endMinutes: 900,
        extraMinutesOverride: null,
        project: 'PARCO NORD',
        section: '',
        interventionType: 'Correttivo',
        statusPercent: 100,
        description,
        technician: { name: 'Mario Rossi', email: 'mario@example.test' },
        colleagues: [],
        createdAt: now - i * 1000,
        updatedAt: now - i * 1000,
      })),
    )

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Usa una descrizione già scritta' }))

    const listed = Array.from(document.querySelectorAll('.reuse-item')).map((el) => el.textContent)
    expect(listed).toEqual(['Ripetuta', 'Più vecchia'])
  })

  const LONG =
    'Sostituzione completa degli inverter nella cabina PB09, controllo delle protezioni e ' +
    'verifica del cablaggio di tutte le stringhe collegate'

  it('offers to open up a description too long for one line', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.type(await screen.findByPlaceholderText('Cosa hai fatto?'), LONG)
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(screen.getByRole('button', { name: /Calendario/ }))
    const more = await screen.findByRole('button', { name: 'Mostra tutto' })
    expect(more.getAttribute('aria-expanded')).toBe('false')

    await user.click(more)
    const less = await screen.findByRole('button', { name: 'Mostra meno' })
    expect(less.getAttribute('aria-expanded')).toBe('true')
    // Expanded, the row shows the whole text rather than a clipped copy.
    expect(document.querySelector('.dayrow-sub.is-expanded')!.textContent).toBe(LONG)

    await user.click(less)
    expect(await screen.findByRole('button', { name: 'Mostra tutto' })).toBeTruthy()
  })

  it('leaves short descriptions alone', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.type(await screen.findByPlaceholderText('Cosa hai fatto?'), 'Pulizia moduli')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(screen.getByRole('button', { name: /Calendario/ }))
    await screen.findByText('Totale settimana')
    expect(screen.queryByRole('button', { name: 'Mostra tutto' })).toBeNull()
  })

  it('remembers a hand-typed value and offers it next time', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    // "Altro…" on the project list, then a value the pack does not have.
    await user.click((await screen.findAllByRole('button', { name: 'Altro…' }))[0]!)
    const custom = document.querySelector('.stack input.input') as HTMLInputElement
    await user.type(custom, 'PARCO EST')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    expect((await loadSettings()).customValues.projects).toEqual(['PARCO EST'])

    // Offered as a real choice from then on, after the pack's own projects.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    expect(await screen.findByRole('button', { name: 'PARCO EST' })).toBeTruthy()
  })

  it('does not remember a value the company file already provides', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'PARCO SUD' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await loadSettings()).customValues.projects).toEqual([])
  })

  it('removes a mistyped colleague from settings without touching saved reports', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Add a colleague by hand, with a typo.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.type(await screen.findByPlaceholderText('Aggiungi collega'), 'Crlos Gallego')
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await loadSettings()).customColleagues.map((p) => p.name)).toEqual(['Crlos Gallego'])

    await user.click(screen.getByRole('button', { name: /Impostazioni/ }))
    await user.click(await screen.findByRole('button', { name: 'Togli Crlos Gallego' }))

    await waitFor(async () => expect((await loadSettings()).customColleagues).toEqual([]))
    // The report that already used the name keeps it: correcting a list is not a rewrite.
    const [entry] = await db.entries.toArray()
    expect(entry!.colleagues.map((p) => p.name)).toEqual(['Crlos Gallego'])
  })

  it('treats the same name typed differently as one remembered entry', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const name of ['Luca Bianchi', 'luca bianchi ']) {
      await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
      await user.type(await screen.findByPlaceholderText('Aggiungi collega'), name)
      await user.click(screen.getByRole('button', { name: '+' }))
      await user.click(screen.getByRole('button', { name: 'Salva' }))
      await waitFor(async () => expect(document.querySelector('.sheet')).toBeNull())
    }

    expect((await loadSettings()).customColleagues).toHaveLength(1)
  })

  it('shows a month of work and reaches a day from it', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Two days in the current month, one of them with overtime.
    const first = new Date(today.getFullYear(), today.getMonth(), 4)
    const second = new Date(today.getFullYear(), today.getMonth(), 12)

    await db.entries.bulkPut(
      [
        [iso(first), 420, 900],
        [iso(second), 420, 1020],
      ].map(([date, start, end], i) => ({
        id: `m-${i}`,
        date: date as string,
        startMinutes: start as number,
        endMinutes: end as number,
        extraMinutesOverride: null,
        project: 'PARCO NORD',
        section: '',
        interventionType: 'Correttivo',
        statusPercent: 100,
        description: 'Lavoro',
        technician: { name: 'Mario Rossi', email: 'mario@example.test' },
        colleagues: [],
        createdAt: 1,
        updatedAt: 1,
      })),
    )

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Calendario/ }))
    await user.click(await screen.findByRole('button', { name: 'Mese' }))

    // Month totals: 8h + 10h across two days, 2h of it overtime.
    expect(await screen.findByText('18h')).toBeTruthy()
    expect(screen.getByText('2h')).toBeTruthy()

    // The grid prints hours in the cells that have work.
    const cells = Array.from(document.querySelectorAll('.month-cell.has-work'))
    expect(cells).toHaveLength(2)
    expect(cells.map((c) => c.querySelector('.month-hours')!.textContent)).toEqual(['8', '10'])
    expect(document.querySelectorAll('.month-cell.has-overtime')).toHaveLength(1)

    // Tapping a day goes to it.
    await user.click(cells[0] as HTMLElement)
    expect(await screen.findByText('07:00 – 15:00')).toBeTruthy()
  })

  it('jumps to any month of any year in two taps', async () => {
    const user = userEvent.setup()
    await db.entries.put({
      id: 'old',
      date: '2025-03-11',
      startMinutes: 420,
      endMinutes: 900,
      extraMinutesOverride: null,
      project: 'PARCO NORD',
      section: '',
      interventionType: 'Correttivo',
      statusPercent: 100,
      description: 'Lavoro di un anno fa',
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      colleagues: [],
      createdAt: 1,
      updatedAt: 1,
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Calendario/ }))
    await user.click(await screen.findByRole('button', { name: 'Mese' }))

    // The title opens the picker; years run back to the oldest entry.
    await user.click(screen.getByRole('button', { name: /Vai a…/ }))
    await user.click(await screen.findByRole('button', { name: '2025' }))
    await user.click(await screen.findByRole('button', { name: 'marzo' }))

    // A day from over a year ago is now on screen with its hours.
    const worked = await screen.findByText('8')
    expect(worked.closest('.month-cell')).toBeTruthy()
  })

  it('shows the week view with the days that are still missing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(screen.getByRole('button', { name: /Calendario/ }))
    const week = await screen.findByText('Totale settimana')
    expect(week).toBeTruthy()
    // Six of the seven days have nothing in them yet, and say so.
    expect((await screen.findAllByText('Da compilare')).length).toBe(6)
  })
})

withTemplate('the whole path from typing to spreadsheet', () => {
  it('puts what the technician typed into the right cells', async () => {
    await savePack(testPack(templateBase64()))
    await saveSettings({
      ...defaultSettings(),
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      onboardingComplete: true,
    })

    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.type(await screen.findByPlaceholderText('Cosa hai fatto?'), 'Sostituzione inverter')
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    // Build the report through the same code path the export button uses.
    const { buildReport } = await import('./lib/report')
    const entries = await db.entries.toArray()
    const pack = (await db.packs.get('pack'))!
    const report = buildReport(entries, pack, {
      anchorDate: entries[0]!.date,
      technicianName: 'Mario Rossi',
    })

    const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('Sostituzione inverter')
    expect(sheet).toContain('Mario Rossi')
    expect(sheet).toContain('PARCO NORD')
    expect(sheet).toContain('IMPRESA X')
    // 07:00 and 15:00 as Excel day fractions.
    expect(sheet).toMatch(/<c r="M10"[^>]*><v>0\.29166/)
    expect(sheet).toMatch(/<c r="N10"[^>]*><v>0\.625<\/v>/)
    expect(report.filename).toMatch(/^Report_S\d\d_\d{4}_Mario_Rossi\.xlsx$/)
  })
})
