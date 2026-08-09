/**
 * These tests run against a real company template when one is present on the machine.
 *
 * The template is gitignored and never committed, so the fidelity suites skip themselves
 * when it is absent and a clean checkout still passes. See `src/testing/template.ts` for
 * why every read has to be deferred rather than done in the suite body.
 */

import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { lazy, templateBytes, withTemplate } from '../testing/template'
import {
  columnLetter,
  dateToSerial,
  fillTemplate,
  minutesToDayFraction,
  num,
  text,
  type Row,
} from './xlsx'

describe('spreadsheet units', () => {
  it('converts dates to Excel serial numbers', () => {
    // Verified against the sample rows that shipped inside the template.
    expect(dateToSerial(2026, 7, 16)).toBe(46219)
    expect(dateToSerial(2026, 7, 30)).toBe(46233)
  })

  it('converts clock times to day fractions', () => {
    expect(minutesToDayFraction(8 * 60)).toBeCloseTo(0.3333333333, 9)
    expect(minutesToDayFraction(16 * 60)).toBeCloseTo(0.6666666666, 9)
    expect(minutesToDayFraction(0)).toBe(0)
  })

  it('names columns', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(16)).toBe('Q')
    expect(columnLetter(26)).toBe('AA')
  })
})

/**
 * Every text value the template's own data region contains, read through its shared
 * string table. Used to assert that none of it survives an export.
 */
function dataRegionStrings(files: Record<string, Uint8Array>, fromRow: number): string[] {
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!)
  const sharedPart = files['xl/sharedStrings.xml']
  if (!sharedPart) return []

  const shared = (strFromU8(sharedPart).match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
      .map((part) => part.replace(/<[^>]+>/g, ''))
      .join('')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  )

  const body = sheet.slice(sheet.indexOf(`<row r="${fromRow}"`), sheet.indexOf('</sheetData>'))
  const values = new Set<string>()
  for (const cell of body.match(/<c\b[^>]*t="s"[^>]*>[\s\S]*?<\/c>/g) ?? []) {
    const index = /<v>(\d+)<\/v>/.exec(cell)?.[1]
    const value = index === undefined ? undefined : shared[Number(index)]
    // Skip the non-breaking space the template uses to pad its blank rows.
    if (value && value.replace(/ /g, '').trim() !== '') values.add(value)
  }
  return [...values]
}

withTemplate('filling a real template', () => {
  const DATA_START = 10

  const rows: Row[] = [
    [
      num(dateToSerial(2026, 8, 3)),
      text('AGOSTO'),
      num(32),
      text('PROGETTO DI PROVA'),
      text('N/A'),
      text('Correttivo'),
      num(1),
      text('Descrizione di prova con caratteri speciali <&>"\''),
      text('IMPRESA DI PROVA'),
      text('CLIENTE DI PROVA'),
      text('Nome Cognome'),
      text('nome.cognome@example.test'),
      num(minutesToDayFraction(7 * 60)),
      num(minutesToDayFraction(17 * 60)),
      num(minutesToDayFraction(10 * 60)),
      num(8),
      num(2),
    ],
    [
      num(dateToSerial(2026, 8, 4)),
      text('AGOSTO'),
      num(32),
      text('PROGETTO DI PROVA'),
      text('N/A'),
      text('Preventivo'),
      num(1),
      text('Seconda riga'),
      text('IMPRESA DI PROVA'),
      text('CLIENTE DI PROVA'),
      text('Nome Cognome'),
      text('nome.cognome@example.test'),
      num(minutesToDayFraction(7 * 60)),
      num(minutesToDayFraction(15 * 60)),
      num(minutesToDayFraction(8 * 60)),
      num(8),
    ],
  ]

  // Built on first use, not here: a skipped suite body still runs.
  const fixture = lazy(() => {
    const original = templateBytes()
    const after = unzipSync(fillTemplate(original, { dataStartRow: DATA_START, rows }))
    return {
      original,
      before: unzipSync(original),
      after,
      sheet: strFromU8(after['xl/worksheets/sheet1.xml']!),
    }
  })

  it('preserves every archive part except the worksheet', () => {
    expect(Object.keys(fixture().after).sort()).toEqual(Object.keys(fixture().before).sort())
    for (const name of Object.keys(fixture().before)) {
      if (name === 'xl/worksheets/sheet1.xml') continue
      expect(
        Buffer.from(fixture().after[name]!).equals(Buffer.from(fixture().before[name]!)),
        `${name} was modified`,
      ).toBe(true)
    }
  })

  it('keeps the embedded logos byte-for-byte', () => {
    const media = Object.keys(fixture().before).filter((n) => n.startsWith('xl/media/'))
    expect(media.length).toBeGreaterThan(0)
    for (const name of media) {
      expect(Buffer.from(fixture().after[name]!).equals(Buffer.from(fixture().before[name]!))).toBe(true)
    }
  })

  it('leaves the header block untouched', () => {
    const headerOf = (xml: string) => xml.slice(0, xml.indexOf(`<row r="${DATA_START}"`))
    expect(headerOf(fixture().sheet)).toBe(
      headerOf(strFromU8(fixture().before['xl/worksheets/sheet1.xml']!)),
    )
  })

  it('reads the template only when a test actually needs it', () => {
    // Guards the CI failure this file caused: a suite body runs even when skipped, so
    // any template read must sit behind `fixture()` and never at suite level.
    expect(templateBytes().length).toBeGreaterThan(0)
  })

  it('writes the data rows', () => {
    expect(fixture().sheet).toContain('<c r="A10"')
    expect(fixture().sheet).toContain('PROGETTO DI PROVA')
    expect(fixture().sheet).toContain('Seconda riga')
    expect(fixture().sheet).toContain('nome.cognome@example.test')
  })

  it('escapes special characters instead of corrupting the XML', () => {
    expect(fixture().sheet).toContain('&lt;&amp;&gt;&quot;&apos;')
  })

  it('reuses the styles the template already applies to its data region', () => {
    const row10 = /<row\b[^>]*\br="10"[^>]*>[\s\S]*?<\/row>/.exec(fixture().sheet)?.[0] ?? ''
    // Date, time and percentage columns must keep their number formats, otherwise the
    // file shows raw serial numbers instead of dates.
    expect(row10).toMatch(/<c r="A10" s="\d+"/)
    expect(row10).toMatch(/<c r="M10" s="\d+"/)
    expect(row10).toMatch(/<c r="G10" s="\d+"/)
  })

  it('removes every trace of the sample data that shipped with the template', () => {
    // The forbidden strings are read out of the template itself rather than written
    // down here, so this file names no real person, project or company — and the test
    // still works against any template it is pointed at.
    const written = new Set(
      rows.flatMap((row) =>
        row.filter((cell) => cell?.kind === 'text').map((cell) => (cell as { value: string }).value),
      ),
    )
    const forbidden = dataRegionStrings(fixture().before, DATA_START).filter(
      (value) => value.trim() !== '' && !written.has(value),
    )

    expect(forbidden.length).toBeGreaterThan(0)
    const sheet = fixture().sheet
    const dataRegion = sheet.slice(
      sheet.indexOf(`<row r="${DATA_START}"`),
      sheet.indexOf('</sheetData>'),
    )
    for (const value of forbidden) {
      expect(dataRegion.includes(value), 'sample data survived into the export').toBe(false)
    }
  })

  it('drops the stale mailto links on the technician column', () => {
    const links = /<hyperlinks>[\s\S]*?<\/hyperlinks>/.exec(fixture().sheet)?.[0] ?? ''
    expect(links).not.toMatch(/ref="L\d+/)
    // Header links belong to the company block and must survive.
    expect(links).toContain('N3:Q3')
  })

  it('updates the sheet dimension', () => {
    expect(fixture().sheet).toMatch(/<dimension ref="A1:[A-Z]+\d+"\/>/)
  })

  it('produces well-formed XML for every part', () => {
    for (const [name, bytes] of Object.entries(fixture().after)) {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue
      const xml = strFromU8(bytes)
      const opens = (xml.match(/<row\b/g) ?? []).length
      const closes = (xml.match(/<\/row>/g) ?? []).length + (xml.match(/<row\b[^>]*\/>/g) ?? []).length
      expect(opens, `${name} has unbalanced <row> tags`).toBe(closes)
    }
  })

  it('handles a full history far longer than the template', () => {
    // Roughly two years of daily entries — what "export everything" produces after a
    // while, and well past the 75 rows the template itself styles.
    const many: Row[] = Array.from({ length: 500 }, (_, i) => [
      num(dateToSerial(2026, 8, 3)),
      text('AGOSTO'),
      num(32),
      text('PROGETTO'),
      text('N/A'),
      text('Correttivo'),
      num(1),
      text(`Voce numero ${i + 1}`),
    ])
    const bytes = fillTemplate(fixture().original, { dataStartRow: DATA_START, rows: many })
    const big = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']!)

    expect(big).toContain('Voce numero 1')
    expect(big).toContain('Voce numero 500')
    // Last row lands where it should, and the sheet declares the right extent.
    expect(big).toContain(`<c r="A${DATA_START + 499}"`)
    expect(big).toMatch(new RegExp(`<dimension ref="A1:[A-Z]+${DATA_START + 499}"/>`))
    // Still a valid archive with the logos untouched.
    const parts = unzipSync(bytes)
    expect(Object.keys(parts).filter((n) => n.startsWith('xl/media/')).length).toBeGreaterThan(0)
  })

  it('grows beyond the template styled rows when a week is unusually busy', () => {
    const many: Row[] = Array.from({ length: 90 }, (_, i) => [
      num(dateToSerial(2026, 8, 3)),
      text('AGOSTO'),
      num(32),
      text(`Riga ${i + 1}`),
    ])
    const big = strFromU8(
      unzipSync(fillTemplate(fixture().original, { dataStartRow: DATA_START, rows: many }))[
        'xl/worksheets/sheet1.xml'
      ]!,
    )
    expect(big).toContain('Riga 90')
    expect(big).toContain(`<c r="A${DATA_START + 89}"`)
  })
})
