import { describe, expect, it } from 'vitest'
import { parsePack } from './pack'
import { bytesToBase64 } from './base64'
import { zipSync, strToU8 } from 'fflate'

/** The smallest thing that passes the "is this really an .xlsx" check. */
const fakeTemplate = bytesToBase64(zipSync({ 'xl/workbook.xml': strToU8('<workbook/>') }))

const base = {
  formatVersion: 1,
  templateBase64: fakeTemplate,
  sheet: { dataStartRow: 10, columns: { date: 0, project: 1 } },
  lists: { projects: ['P'], interventionTypes: ['T'] },
}

describe('hours column formats', () => {
  it('defaults the total to a day fraction and the hours columns to decimals', () => {
    const pack = parsePack(base)
    expect(pack.sheet.totalFormat).toBe('fraction')
    expect(pack.sheet.hoursFormat).toBe('decimal')
  })

  it('migrates a pack built before the formats were split', () => {
    // Old packs carried one durationFormat covering total, normal and overtime.
    const pack = parsePack({ ...base, sheet: { ...base.sheet, durationFormat: 'fraction' } })
    expect(pack.sheet.totalFormat).toBe('fraction')
    expect(pack.sheet.hoursFormat).toBe('fraction')
  })

  it('honours explicit formats over the legacy field', () => {
    const pack = parsePack({
      ...base,
      sheet: { ...base.sheet, durationFormat: 'fraction', hoursFormat: 'decimal' },
    })
    expect(pack.sheet.hoursFormat).toBe('decimal')
  })

  it('rejects a format it does not understand', () => {
    expect(() => parsePack({ ...base, sheet: { ...base.sheet, hoursFormat: 'nonsense' } })).toThrow()
  })
})
