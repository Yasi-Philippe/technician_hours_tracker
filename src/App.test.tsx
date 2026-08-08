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

  it('will not let a technician start without the company file', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Benvenuto')

    await user.click(screen.getByRole('button', { name: 'Continua' }))
    await user.type(await screen.findByPlaceholderText('Nome e cognome'), 'Mario Rossi')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    const start = await screen.findByRole('button', { name: 'Inizia' })
    expect((start as HTMLButtonElement).disabled).toBe(true)
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

  it('shows the week view with the days that are still missing', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    await user.click(screen.getByRole('button', { name: /Settimana/ }))
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
