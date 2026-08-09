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
import { clearPack, db, loadSettings, resetEverything, savePack, saveSettings, defaultSettings } from './db'
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

withTemplate('removing the company file', () => {
  beforeEach(async () => {
    await savePack(testPack(templateBase64()))
    await saveSettings({
      ...defaultSettings(),
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      onboardingComplete: true,
    })
  })

  it('leaves nothing from the company file behind', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Work a normal day, so the pack's values get remembered as "last used".
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.click(await screen.findByRole('button', { name: 'A1' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    const before = await loadSettings()
    expect(before.lastProject).toBe('PARCO NORD')
    expect(before.lastSection).toBe('A1')

    // Now remove the company file.
    await clearPack()

    const after = await loadSettings()
    const leftovers = [
      after.lastProject,
      after.lastSection,
      after.lastInterventionType,
      ...after.customValues.projects,
      ...after.customValues.sections,
      ...after.customValues.interventionTypes,
      ...after.customColleagues.map((p) => p.name),
    ]
    // Nothing the company file supplied may survive its removal.
    expect(leftovers).not.toContain('PARCO NORD')
    expect(leftovers).not.toContain('A1')
    expect(leftovers).not.toContain('Ana Lopez')
  })

  it('really deletes everything when asked to', async () => {
    await savePack(testPack(templateBase64()))
    await saveSettings({
      ...defaultSettings(),
      technician: { name: 'Mario Rossi', email: 'mario@example.test' },
      lastProject: 'PARCO NORD',
      lastSection: 'A1',
      onboardingComplete: true,
    })
    await db.entries.put({
      id: 'x', date: '2026-08-03', segments: [{ startMinutes: 420, endMinutes: 900 }],
      extraMinutesOverride: null, project: 'PARCO NORD', section: 'A1',
      interventionType: 'Correttivo', statusPercent: 100, description: 'x',
      technician: { name: 'Mario Rossi', email: '' }, colleagues: [], createdAt: 1, updatedAt: 1,
    })

    await resetEverything()

    expect(await db.entries.count()).toBe(0)
    expect(await db.packs.count()).toBe(0)
    const settings = await loadSettings()
    expect(settings.lastProject).toBe('')
    expect(settings.lastSection).toBe('')
    expect(settings.technician.name).toBe('')
  })
})

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
    expect(entry!.segments).toEqual([{ startMinutes: 420, endMinutes: 900 }])
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
    expect(entry!.segments[0]!.endMinutes).toBe(17 * 60 + 30)
    expect(entry!.extraMinutesOverride).toBeNull()
  })

  it('records a split day as one report and finds the overtime across it', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    // On site 07:00–15:00 as usual…
    expect(await screen.findByDisplayValue('07:00')).toBeTruthy()

    // …then called back later the same day.
    await user.click(screen.getByRole('button', { name: 'Aggiungi un altro orario' }))
    const clocks = () => screen.getAllByRole('textbox') as HTMLInputElement[]

    const secondStart = document.querySelectorAll('.timebox-value')[2] as HTMLInputElement
    const secondEnd = document.querySelectorAll('.timebox-value')[3] as HTMLInputElement
    await user.clear(secondStart)
    await user.type(secondStart, '17:00')
    await user.tab()
    await user.clear(secondEnd)
    await user.type(secondEnd, '19:00')
    await user.tab()

    // Ten hours in total, eight normal and two extra — exactly what the day was.
    expect(await screen.findByText('10h')).toBeTruthy()
    expect(screen.getByText(/2h ore extra/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))

    // One report, two stretches.
    const [entry] = await db.entries.toArray()
    expect(entry!.segments).toEqual([
      { startMinutes: 7 * 60, endMinutes: 15 * 60 },
      { startMinutes: 17 * 60, endMinutes: 19 * 60 },
    ])

    // Both stretches are shown on the day.
    expect(await screen.findByText('07:00 – 15:00')).toBeTruthy()
    expect(screen.getByText('17:00 – 19:00')).toBeTruthy()
    expect(clocks).toBeTruthy()
  })

  it('writes a split day to the spreadsheet as one row spanning the whole day', async () => {
    const { buildReport } = await import('./lib/report')
    const pack = testPack(templateBase64())
    const report = buildReport(
      [
        {
          id: 's',
          date: '2026-08-03',
          segments: [
            { startMinutes: 7 * 60, endMinutes: 15 * 60 },
            { startMinutes: 17 * 60, endMinutes: 19 * 60 },
          ],
          extraMinutesOverride: null,
          project: 'PARCO NORD',
          section: '',
          interventionType: 'Correttivo',
          statusPercent: 100,
          description: 'Giornata spezzata',
          technician: { name: 'Mario Rossi', email: 'mario@example.test' },
          colleagues: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      pack,
      { anchorDate: '2026-08-03', technicianName: 'Mario Rossi' },
    )

    const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
    // The span is first on site to last off: 07:00 and 19:00.
    expect(sheet).toMatch(/<c r="M10"[^>]*><v>0\.29166/)
    expect(sheet).toMatch(/<c r="N10"[^>]*><v>0\.79166/)
    // But the totals are the hours actually worked: 10 = 8 normal + 2 extra.
    expect(sheet).toMatch(/<c r="O10"[^>]*><v>0\.41666/)
    expect(sheet).toMatch(/<c r="P10"[^>]*><v>8<\/v>/)
    expect(sheet).toMatch(/<c r="Q10"[^>]*><v>2<\/v>/)
    // Still one row.
    expect(sheet).not.toMatch(/<c r="A11"[^>]*><v>/)
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
    // Medium-length labels get two across.
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

  it('offers no colleagues until the technician adds one', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))

    // The company file supplies no people, so the list starts empty by design.
    expect(document.querySelectorAll('.chips .chip')).toHaveLength(0)
    expect(await screen.findByText('Da solo')).toBeTruthy()

    // Typed once…
    await user.type(await screen.findByPlaceholderText('Aggiungi collega'), 'Luca Bianchi')
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [entry] = await db.entries.toArray()
    expect(entry!.colleagues.map((p) => p.name)).toEqual(['Luca Bianchi'])

    // …and offered from then on, from the technician's own list.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    expect(await screen.findByRole('button', { name: 'Luca Bianchi' })).toBeTruthy()
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
        segments: [{ startMinutes: 420, endMinutes: 900 }],
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

  it('warns plainly that browser storage can be wiped, in both languages', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Impostazioni/ }))

    const warning = document.querySelector('.notice.is-warning')!
    expect(warning).toBeTruthy()
    // Names where the data actually lives, and that it can vanish.
    expect(warning.textContent).toMatch(/memoria del browser/)
    expect(warning.textContent).toMatch(/cancellata/)
    // And the card says how often to take a copy.
    expect(screen.getByText(/una volta a settimana/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Español' }))
    await waitFor(() =>
      expect(document.querySelector('.notice.is-warning')!.textContent).toMatch(
        /memoria del navegador/,
      ),
    )
    expect(screen.getByText(/una vez por semana/)).toBeTruthy()
  })

  it('removes a mistyped colleague from settings without touching saved reports', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Add a colleague by hand, with a typo.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    await user.type(await screen.findByPlaceholderText('Aggiungi collega'), 'Luigi Verd')
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await loadSettings()).customColleagues.map((p) => p.name)).toEqual(['Luigi Verd'])

    await user.click(screen.getByRole('button', { name: /Impostazioni/ }))
    await user.click(await screen.findByRole('button', { name: 'Togli Luigi Verd' }))

    await waitFor(async () => expect((await loadSettings()).customColleagues).toEqual([]))
    // The report that already used the name keeps it: correcting a list is not a rewrite.
    const [entry] = await db.entries.toArray()
    expect(entry!.colleagues.map((p) => p.name)).toEqual(['Luigi Verd'])
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

  /** The cell for a day of the month on screen, ignoring the faded neighbouring months. */
  const monthCell = (day: string) =>
    Array.from(document.querySelectorAll('.month-cell')).find(
      (el) =>
        el.querySelector('.month-num')!.textContent === day &&
        !el.classList.contains('is-outside'),
    )!

  /** Open the jump sheet and go to a month. The year chips only appear when there is
   *  more than one year of history, so pick one only if it is offered. */
  const jumpTo = async (user: ReturnType<typeof userEvent.setup>, year: string, month: string) => {
    await user.click(screen.getByRole('button', { name: /Vai a…/ }))
    const yearChip = screen.queryByRole('button', { name: year })
    if (yearChip) await user.click(yearChip)
    await user.click(await screen.findByRole('button', { name: month }))
  }

  it('leads with a hero figure and splits normal from overtime', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const iso = (day: number) =>
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    await db.entries.bulkPut(
      [
        [iso(4), 420, 900], // 8h
        [iso(5), 420, 1020], // 10h -> 2h overtime
      ].map(([date, start, end], i) => ({
        id: `s-${i}`,
        date: date as string,
        segments: [{ startMinutes: start as number, endMinutes: end as number }],
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
    await user.click(await screen.findByRole('button', { name: /Statistiche/ }))

    // 18h total, of which 2h overtime — the headline, not a one-bar chart.
    await waitFor(() => expect(document.querySelector('.hero-value')!.textContent).toBe('18h'))
    expect(screen.getByText(/16h Ore normali/)).toBeTruthy()
    expect(screen.getByText(/2h Ore extra/)).toBeTruthy()

    // Supporting numbers as stat tiles.
    expect(screen.getByText('Giorni lavorati')).toBeTruthy()
    expect(screen.getByText('Giornata più lunga')).toBeTruthy()
  })

  it('switches between week, month and year', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Statistiche/ }))

    // Month is the default period.
    expect(screen.getByRole('button', { name: 'Mese' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Anno' }))
    expect(screen.getByRole('button', { name: 'Anno' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Mese' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the chart readout the same shape whether or not a bar is touched', async () => {
    const user = userEvent.setup()
    const today = new Date()
    await db.entries.put({
      id: 'hover',
      date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-04`,
      segments: [{ startMinutes: 420, endMinutes: 1020 }],
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
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Statistiche/ }))
    await screen.findByText('Ore per giorno')

    // Both lines exist before anything is hovered — that is what stops the shift.
    const label = () => document.querySelector('.chart-readout-label')!
    const value = () => document.querySelector('.chart-readout-value')!
    expect(label()).toBeTruthy()
    expect(value()).toBeTruthy()
    expect(label().textContent).toBe('\u00A0')
    expect(value().textContent).toBe('\u00A0')

    // Hover a column: the same two elements fill in, none are added or removed.
    const column = document.querySelector('.chart-normal')!.closest('g')!
    await user.hover(column)

    expect(document.querySelectorAll('.chart-readout-label')).toHaveLength(1)
    expect(document.querySelectorAll('.chart-readout-value')).toHaveLength(1)
    expect(label().textContent).not.toBe('\u00A0')
    expect(value().textContent).toContain('10h')
  })

  it('offers the numbers behind the chart, for anyone who cannot read it', async () => {
    const user = userEvent.setup()
    const today = new Date()
    await db.entries.put({
      id: 'tbl',
      date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-04`,
      segments: [{ startMinutes: 420, endMinutes: 1020 }],
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
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Statistiche/ }))

    expect(document.querySelector('.data-table')).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Mostra i numeri' }))

    const table = document.querySelector('.data-table')!
    expect(table).toBeTruthy()
    // Every value the chart encodes, readable without colour or shape.
    expect(table.textContent).toContain('10h')
    expect(table.textContent).toContain('2h')
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
        segments: [{ startMinutes: start as number, endMinutes: end as number }],
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

    // Tapping a day opens it here, without leaving the calendar.
    await user.click(cells[0] as HTMLElement)
    expect(await screen.findByText('07:00 – 15:00')).toBeTruthy()
    // Still on the calendar: the month grid and its toggle are on screen.
    expect(document.querySelector('.month-grid')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mese' })).toBeTruthy()
  })

  it('marks weekends and Italian holidays as non-working, but not Spanish ones', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Calendario/ }))
    await user.click(await screen.findByRole('button', { name: 'Mese' }))

    // October 2026: the 12th is a Spanish national holiday and an ordinary Monday in Italy.
    await jumpTo(user, '2026', 'ottobre')

    // Saturday and Sunday are closed.
    expect(monthCell('10').classList.contains('is-closed')).toBe(true)
    expect(monthCell('11').classList.contains('is-closed')).toBe(true)
    // The Spanish national day is flagged but still a working day.
    expect(monthCell('12').classList.contains('is-closed')).toBe(false)
    expect(monthCell('12').classList.contains('is-spanish-holiday')).toBe(true)

    // 1 November is Ognissanti in Italy — closed.
    await jumpTo(user, '2026', 'novembre')
    expect(monthCell('1').classList.contains('is-closed')).toBe(true)
  })

  it('names the holiday on the day screen, for both countries', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Calendario/ }))
    await user.click(await screen.findByRole('button', { name: 'Mese' }))

    // 6 January is Epiphany in both countries.
    await jumpTo(user, '2026', 'gennaio')
    await user.click(monthCell('6') as HTMLElement)

    expect(await screen.findByText('Epifania')).toBeTruthy()
    expect(screen.getByText('Epifanía del Señor')).toBeTruthy()
    // Only the Italian one is styled as a closed day.
    const notices = Array.from(document.querySelectorAll('.notice'))
    expect(notices.filter((n) => n.classList.contains('is-closed-day'))).toHaveLength(1)
  })

  it('opens a day in place and lets it be edited without leaving the calendar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Calendario/ }))

    // Week mode: tap a day row.
    const rows = document.querySelectorAll('.dayrow-open')
    await user.click(rows[0] as HTMLElement)

    // The day opens over the calendar, headed by its date — no scrolling to find it.
    const sheet = document.querySelector('.sheet')!
    expect(sheet).toBeTruthy()
    expect(sheet.querySelector('.sheet-subtitle')!.textContent).toMatch(/\d/)
    // The calendar is still there underneath.
    expect(document.querySelectorAll('.dayrow').length).toBe(7)

    // And it is fully editable from here.
    // The entry form stacks over the day sheet, and closes back to it rather than
    // dismissing everything at once.
    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    expect(document.querySelectorAll('.sheet')).toHaveLength(2)
    await user.click(await screen.findByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await waitFor(() => expect(document.querySelectorAll('.sheet')).toHaveLength(1))

    // Closing puts it away without navigating anywhere.
    await user.click(screen.getByRole('button', { name: 'Chiudi il giorno' }))
    expect(document.querySelector('.sheet')).toBeNull()
    expect(document.querySelectorAll('.dayrow').length).toBe(7)
  })

  it('says which day the entry form is filling in', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Aggiungi' }))
    const head = document.querySelector('.sheet-head')!
    // The form is never anonymous: the day is in the header, above the scrolling body.
    expect(head.querySelector('.sheet-subtitle')).toBeTruthy()
    expect(head.querySelector('.sheet-subtitle')!.textContent!.length).toBeGreaterThan(6)
  })

  it('switches between days inside the calendar sheet without closing it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Calendario/ }))

    // Open Monday from the week list.
    await user.click(document.querySelectorAll('.dayrow-open')[0] as HTMLElement)
    const sheet = () => document.querySelector('.sheet')!
    const shownDate = () => sheet().querySelector('.sheet-subtitle')!.textContent

    const monday = shownDate()
    // The strip inside the sheet offers the whole week.
    const strip = sheet().querySelector('.weekstrip.in-sheet')!
    expect(strip).toBeTruthy()
    expect(strip.querySelectorAll('.daychip')).toHaveLength(7)

    // Tapping Wednesday swaps the day in place — the sheet never closes.
    await user.click(strip.querySelectorAll('.daychip')[2] as HTMLElement)
    await waitFor(() => expect(shownDate()).not.toBe(monday))
    expect(document.querySelectorAll('.sheet')).toHaveLength(1)

    // And the day being edited is the one now selected in the strip.
    const selected = sheet().querySelector('.daychip.is-selected')!
    expect(selected).toBeTruthy()
    expect(shownDate()).toContain(selected.querySelector('.daychip-number')!.textContent)
  })

  it('jumps to any month of any year in two taps', async () => {
    const user = userEvent.setup()
    await db.entries.put({
      id: 'old',
      date: '2025-03-11',
      segments: [{ startMinutes: 420, endMinutes: 900 }],
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
    await jumpTo(user, '2025', 'marzo')

    // The day from over a year ago is on screen, with its hours in the cell.
    await waitFor(() =>
      expect(monthCell('11').querySelector('.month-hours')!.textContent).toBe('8'),
    )
    expect(monthCell('11').classList.contains('has-work')).toBe(true)
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
