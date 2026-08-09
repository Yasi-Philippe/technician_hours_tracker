import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { lazy, templateBytes, withTemplate } from '../testing/template'
import type { CompanyPack, Entry } from '../types'
import { buildReport, crewOf, fileNameForRange, reportFileName, reportRows, summarise } from './report'
import { bytesToBase64 } from './base64'

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: over.id ?? 'e1',
  date: '2026-08-03',
  startMinutes: 7 * 60,
  endMinutes: 15 * 60,
  extraMinutesOverride: null,
  project: 'PROGETTO A',
  section: '',
  interventionType: 'Correttivo',
  statusPercent: 100,
  description: 'Manutenzione',
  technician: { name: 'Mario Rossi', email: 'mario@example.test' },
  colleagues: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

const pack = (templateBase64: string): CompanyPack => ({
  id: 'pack',
  formatVersion: 1,
  packVersion: '1',
  label: 'Test',
  templateBase64,
  sheet: {
    dataStartRow: 10,
    columns: {
      date: 0,
      month: 1,
      week: 2,
      project: 3,
      section: 4,
      interventionType: 5,
      statusPercent: 6,
      description: 7,
      impresa: 8,
      cliente: 9,
      technicianName: 10,
      technicianEmail: 11,
      startTime: 12,
      endTime: 13,
      totalHours: 14,
      normalHours: 15,
      extraHours: 16,
    },
    timeFormat: 'fraction',
      totalFormat: 'fraction',
      hoursFormat: 'decimal',
    percentScale: 1,
    uppercaseMonth: true,
    emptySectionText: 'N/A',
  },
  constants: { impresa: 'IMPRESA X', cliente: 'CLIENTE Y' },
  lists: { projects: ['PROGETTO A'], sections: [], interventionTypes: ['Correttivo'] },
  defaults: { startMinutes: 420, endMinutes: 900, contractualDailyMinutes: 480 },
  emailDomain: '@example.test',
  fileNamePattern: 'Report_S{week}_{year}_{name}',
  installedAt: 0,
})

describe('the crew on an intervention', () => {
  it('lists the author first, then colleagues in the order added', () => {
    const crew = crewOf(
      entry({
        colleagues: [
          { name: 'Ana Lopez', email: 'ana@example.test' },
          { name: 'Luca Bianchi', email: 'luca@example.test' },
        ],
      }),
    )
    expect(crew.map((p) => p.name)).toEqual(['Mario Rossi', 'Ana Lopez', 'Luca Bianchi'])
  })

  it('ignores blank colleague slots', () => {
    expect(crewOf(entry({ colleagues: [{ name: '   ', email: '' }] }))).toHaveLength(1)
  })

  it('never repeats a name, whatever the casing', () => {
    const crew = crewOf(
      entry({
        colleagues: [
          { name: 'mario rossi', email: '' },
          { name: 'Ana Lopez', email: '' },
          { name: 'Ana Lopez', email: '' },
        ],
      }),
    )
    expect(crew.map((p) => p.name)).toEqual(['Mario Rossi', 'Ana Lopez'])
  })
})

describe('rows', () => {
  it('produces exactly one row per intervention, whoever was on it', () => {
    const rows = reportRows([
      entry({ id: 'a', colleagues: [{ name: 'Ana Lopez', email: '' }, { name: 'Luca', email: '' }] }),
      entry({ id: 'b', date: '2026-08-04' }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('orders by date', () => {
    const rows = reportRows([
      entry({ id: 'b', date: '2026-08-05' }),
      entry({ id: 'a', date: '2026-08-03' }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('summary', () => {
  it('counts each intervention once and never multiplies the hours by the crew', () => {
    const rows = reportRows([
      entry({ id: 'a', date: '2026-08-03', colleagues: [{ name: 'Ana', email: '' }] }),
      entry({ id: 'b', date: '2026-08-04', startMinutes: 420, endMinutes: 1020 }),
    ])
    const s = summarise(rows, pack(''))
    expect(s.entryCount).toBe(2)
    expect(s.dayCount).toBe(2)
    expect(s.technicians).toEqual(['Ana', 'Mario Rossi'])
    // 8h + 10h, not 8h + 8h + 10h.
    expect(s.totalMinutes).toBe(18 * 60)
    expect(s.extraMinutes).toBe(120)
  })
})

describe('range file names', () => {
  const p = pack('')

  it('uses the company pattern for the weekly report', () => {
    expect(fileNameForRange('week', p, '2026-08-03', 'Mario Rossi', '2026-08-03', '2026-08-07')).toBe(
      'Report_S32_2026_Mario_Rossi.xlsx',
    )
  })

  it('names a month by its month, not a misleading week number', () => {
    const name = fileNameForRange('month', p, '2026-08-03', 'Mario Rossi', '2026-08-01', '2026-08-31')
    expect(name).toBe('Report_AGOSTO_2026_Mario_Rossi.xlsx')
    expect(name).not.toContain('S32')
  })

  it('names a full history by the period it covers', () => {
    expect(fileNameForRange('all', p, '2026-08-03', 'Mario Rossi', '2025-03-11', '2026-08-07')).toBe(
      'Report_completo_2025-03-11_2026-08-07_Mario_Rossi.xlsx',
    )
  })
})

describe('file names', () => {
  it('fills the placeholders and pads the week', () => {
    expect(reportFileName('Report_S{week}_{year}_{name}', '2026-08-03', 'Mario Rossi', '', '')).toBe(
      'Report_S32_2026_Mario_Rossi.xlsx',
    )
  })

  it('strips accents and punctuation that break mail clients', () => {
    expect(reportFileName('{name}', '2026-08-03', 'Yasi Philippe Hübner', '', '')).toBe(
      'Yasi_Philippe_Hubner.xlsx',
    )
  })
})

withTemplate('building a report against a real template', () => {
  // Deferred: a skipped suite still runs its body, and the template is absent in CI.
  const packed = lazy(() => pack(bytesToBase64(templateBytes())))

  it('writes one row carrying the whole crew, with the right values', () => {
    const report = buildReport(
      [
        entry({
          id: 'a',
          date: '2026-08-03',
          startMinutes: 7 * 60,
          endMinutes: 17 * 60,
          colleagues: [{ name: 'Ana Lopez', email: 'ana@example.test' }],
        }),
      ],
      packed(),
      { anchorDate: '2026-08-03', technicianName: 'Mario Rossi' },
    )

    expect(report.filename).toBe('Report_S32_2026_Mario_Rossi.xlsx')
    expect(report.summary.entryCount).toBe(1)

    const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('AGOSTO')
    // Both names share the one TECNICO cell, and there is no second row.
    expect(sheet).toContain('Mario Rossi; Ana Lopez')
    expect(sheet).not.toMatch(/<c r="A11"[^>]*><v>/)
    // Section left blank falls back to the template's own "not applicable" text.
    expect(sheet).toContain('N/A')
    // 10 worked hours = 8 normal + 2 overtime.
    // The total sits in a h:mm:ss cell, so it is a day fraction: 10/24.
    expect(sheet).toMatch(/<c r="O10"[^>]*><v>0\.41666/)
    // Normal and overtime sit in 0.00 cells, so they are decimal hours, not fractions.
    expect(sheet).toMatch(/<c r="P10"[^>]*><v>8<\/v>/)
    expect(sheet).toMatch(/<c r="Q10"[^>]*><v>2<\/v>/)
  })

  it('never writes a day fraction into the plain-number hours columns', () => {
    // The regression this guards: one shared duration format wrote 8h as 0.333 into a
    // cell formatted "0.00", so the report showed 0.33 hours instead of 8.
    for (const [start, end, normal, extra] of [
      [7 * 60, 15 * 60, '8', null],
      [7 * 60, 17 * 60, '8', '2'],
      [8 * 60 + 30, 11 * 60, '2.5', null],
      [5 * 60, 20 * 60, '8', '7'],
    ] as const) {
      const report = buildReport([entry({ startMinutes: start, endMinutes: end })], packed(), {
        anchorDate: '2026-08-03',
        technicianName: 'Mario Rossi',
      })
      const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
      expect(sheet, `${start}-${end} normal`).toMatch(
        new RegExp(`<c r="P10"[^>]*><v>${normal}</v>`),
      )
      if (extra) {
        expect(sheet, `${start}-${end} extra`).toMatch(
          new RegExp(`<c r="Q10"[^>]*><v>${extra}</v>`),
        )
      } else {
        expect(sheet, `${start}-${end} extra empty`).toMatch(/<c r="Q10"[^>]*\/>/)
      }
    }
  })

  it('keeps the total equal to normal plus overtime', () => {
    const report = buildReport([entry({ startMinutes: 5 * 60, endMinutes: 20 * 60 })], packed(), {
      anchorDate: '2026-08-03',
      technicianName: 'Mario Rossi',
    })
    const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
    const total = Number(/<c r="O10"[^>]*><v>([\d.]+)<\/v>/.exec(sheet)![1]) * 24
    const normal = Number(/<c r="P10"[^>]*><v>([\d.]+)<\/v>/.exec(sheet)![1])
    const extra = Number(/<c r="Q10"[^>]*><v>([\d.]+)<\/v>/.exec(sheet)![1])
    expect(total).toBeCloseTo(15, 6)
    expect(normal + extra).toBeCloseTo(total, 6)
  })

  it('leaves the overtime cell empty on a normal day', () => {
    const report = buildReport([entry()], packed(), {
      anchorDate: '2026-08-03',
      technicianName: 'Mario Rossi',
    })
    const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
    expect(sheet).toMatch(/<c r="Q10"[^>]*\/>/)
  })

  it('writes the status as a fraction when the column is formatted as a percentage', () => {
    const report = buildReport([entry({ statusPercent: 50 })], packed(), {
      anchorDate: '2026-08-03',
      technicianName: 'Mario Rossi',
    })
    const sheet = strFromU8(unzipSync(report.bytes)['xl/worksheets/sheet1.xml']!)
    expect(sheet).toMatch(/<c r="G10"[^>]*><v>0\.5<\/v>/)
  })
})
