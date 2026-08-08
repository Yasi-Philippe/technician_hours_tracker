/**
 * Minimal, fidelity-preserving .xlsx writer.
 *
 * An .xlsx file is a ZIP of XML parts. Rather than parsing the whole workbook and
 * writing it back out — which is how mainstream libraries quietly lose embedded
 * images, custom styles and header blocks — this module opens the archive, rewrites
 * only the <sheetData> of the target worksheet, and copies every other byte through
 * untouched.
 *
 * The consequence is that the company template's logos, header block, column widths,
 * number formats, borders, colours and print setup are preserved exactly, because we
 * never look at them.
 *
 * Cell styling is not invented either: we harvest the style index the template already
 * uses for each column of its data region and reuse it, so generated rows are
 * indistinguishable from hand-typed ones.
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

// ---------------------------------------------------------------------------
// Cell values
// ---------------------------------------------------------------------------

export type Cell =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'blank' }

export const text = (value: string): Cell =>
  value === '' ? { kind: 'blank' } : { kind: 'text', value }
export const num = (value: number): Cell => ({ kind: 'number', value })
export const blank: Cell = { kind: 'blank' }

/** A row of cells, indexed by zero-based column (0 = A). Holes are left blank. */
export type Row = ReadonlyArray<Cell | undefined>

export interface FillOptions {
  /** 1-based worksheet row where the data region begins. */
  dataStartRow: number
  /** Rows to write, in order, starting at `dataStartRow`. */
  rows: ReadonlyArray<Row>
}

// ---------------------------------------------------------------------------
// Dates and times, in the units Excel actually stores
// ---------------------------------------------------------------------------

/** Excel's day-zero under the 1900 date system, the default for .xlsx. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000

/** Serial day number for a calendar date, as Excel stores dates. */
export function dateToSerial(year: number, month1: number, day: number): number {
  return Math.round((Date.UTC(year, month1 - 1, day) - EXCEL_EPOCH_UTC) / MS_PER_DAY)
}

/** Fraction of a day, as Excel stores clock times. 08:00 -> 0.3333… */
export function minutesToDayFraction(minutes: number): number {
  return minutes / 1440
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  let out = ''
  for (const ch of s) {
    switch (ch) {
      case '&': out += '&amp;'; break
      case '<': out += '&lt;'; break
      case '>': out += '&gt;'; break
      case '"': out += '&quot;'; break
      case "'": out += '&apos;'; break
      default: {
        const code = ch.codePointAt(0)!
        // Strip control characters that are illegal in XML 1.0 and would make the
        // file unopenable. Tab, newline and carriage return are legal.
        if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break
        out += ch
      }
    }
  }
  return out
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  return m ? m[1] : undefined
}

/** "L14" -> { col: 11, row: 14 }. Column is zero-based. */
function parseRef(ref: string): { col: number; row: number } | undefined {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return undefined
  let col = 0
  for (const ch of m[1]!) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col: col - 1, row: Number(m[2]) }
}

/** 0 -> "A", 26 -> "AA" */
export function columnLetter(col: number): string {
  let n = col + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Numbers as Excel expects them: plain decimal, never exponential notation, and
 * with enough precision that a time fraction round-trips to the same minute.
 */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  const s = String(n)
  return s.includes('e') || s.includes('E') ? n.toFixed(10).replace(/0+$/, '') : s
}

// ---------------------------------------------------------------------------
// Worksheet parsing
// ---------------------------------------------------------------------------

const ROW_RE = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g
const CELL_RE = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g

interface TemplateRow {
  index: number
  /** Raw attribute string of the <row> element, minus nothing — reused verbatim. */
  attrs: string
  /** Style index per zero-based column, as the template already styles this row. */
  styles: Map<number, string>
  raw: string
}

function parseRows(sheetData: string): TemplateRow[] {
  const rows: TemplateRow[] = []
  ROW_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ROW_RE.exec(sheetData))) {
    const attrs = (m[1] ?? m[2] ?? '').trimEnd()
    const body = m[3] ?? ''
    const index = Number(attr(attrs, 'r') ?? '0')
    if (!index) continue

    const styles = new Map<number, string>()
    CELL_RE.lastIndex = 0
    let c: RegExpExecArray | null
    while ((c = CELL_RE.exec(body))) {
      const cAttrs = c[1] ?? c[2] ?? ''
      const ref = attr(cAttrs, 'r')
      const style = attr(cAttrs, 's')
      const parsed = ref ? parseRef(ref) : undefined
      if (parsed && style !== undefined) styles.set(parsed.col, style)
    }
    rows.push({ index, attrs, styles, raw: m[0] })
  }
  return rows
}

/**
 * For each column, the style index the template uses most often across its data
 * region. Used when a value needs a cell the template's blank row does not have.
 */
function dominantStyles(rows: TemplateRow[]): Map<number, string> {
  const tally = new Map<number, Map<string, number>>()
  for (const row of rows) {
    for (const [col, style] of row.styles) {
      let counts = tally.get(col)
      if (!counts) tally.set(col, (counts = new Map()))
      counts.set(style, (counts.get(style) ?? 0) + 1)
    }
  }
  const winner = new Map<number, string>()
  for (const [col, counts] of tally) {
    let best = ''
    let bestCount = -1
    for (const [style, count] of counts) {
      if (count > bestCount) {
        best = style
        bestCount = count
      }
    }
    winner.set(col, best)
  }
  return winner
}

// ---------------------------------------------------------------------------
// Worksheet writing
// ---------------------------------------------------------------------------

function renderCell(ref: string, style: string | undefined, cell: Cell | undefined): string {
  const s = style === undefined ? '' : ` s="${style}"`
  if (!cell || cell.kind === 'blank') return `<c r="${ref}"${s}/>`
  if (cell.kind === 'number') return `<c r="${ref}"${s}><v>${formatNumber(cell.value)}</v></c>`
  // Inline strings keep us out of sharedStrings.xml entirely, so that part of the
  // archive is copied through byte-for-byte like everything else.
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`
}

function renderRow(
  rowIndex: number,
  attrs: string,
  styles: Map<number, string>,
  fallbackStyles: Map<number, string>,
  data: Row | undefined,
): string {
  const cols = new Set<number>(styles.keys())
  if (data) {
    for (let col = 0; col < data.length; col++) {
      const cell = data[col]
      if (cell && cell.kind !== 'blank') cols.add(col)
    }
  }
  if (cols.size === 0) return ''

  const rowAttrs = attrs.replace(/\br="\d+"/, `r="${rowIndex}"`)
  const cells = [...cols]
    .sort((a, b) => a - b)
    .map((col) =>
      renderCell(
        `${columnLetter(col)}${rowIndex}`,
        styles.get(col) ?? fallbackStyles.get(col),
        data?.[col],
      ),
    )
    .join('')

  return `<row${rowAttrs}>${cells}</row>`
}

/**
 * Drop hyperlinks that live inside the data region.
 *
 * The template ships with mailto: links on the technician e-mail cells of its sample
 * rows. Left in place they would survive into every generated file, silently pointing
 * a new technician's name at a former employee's address.
 */
function stripDataRegionHyperlinks(sheet: string, dataStartRow: number): string {
  return sheet.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, (block) => {
    const kept = block
      .replace(/^<hyperlinks>/, '')
      .replace(/<\/hyperlinks>$/, '')
      .match(/<hyperlink\b[^>]*\/>/g)
      ?.filter((link) => {
        const ref = attr(link, 'ref') ?? ''
        const first = parseRef(ref.split(':')[0] ?? '')
        const last = parseRef(ref.split(':')[1] ?? ref.split(':')[0] ?? '')
        const maxRow = Math.max(first?.row ?? 0, last?.row ?? 0)
        return maxRow < dataStartRow
      })
    if (!kept || kept.length === 0) return ''
    return `<hyperlinks>${kept.join('')}</hyperlinks>`
  })
}

function updateDimension(sheet: string, lastRow: number): string {
  return sheet.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_all, c1, r1, c2) => {
    return `<dimension ref="${c1}${r1}:${c2}${lastRow}"/>`
  })
}

function fillWorksheet(sheetXml: string, options: FillOptions): string {
  const open = sheetXml.indexOf('<sheetData>')
  const close = sheetXml.indexOf('</sheetData>')
  if (open === -1 || close === -1) {
    throw new Error('Worksheet has no <sheetData> section')
  }

  const before = sheetXml.slice(0, open + '<sheetData>'.length)
  const after = sheetXml.slice(close)
  const body = sheetXml.slice(open + '<sheetData>'.length, close)

  const all = parseRows(body)
  const header = all.filter((r) => r.index < options.dataStartRow)
  const region = all.filter((r) => r.index >= options.dataStartRow)

  const fallback = dominantStyles(region.length > 0 ? region : all)
  const lastPattern = region[region.length - 1]
  const modelAttrs = region[0]?.attrs ?? lastPattern?.attrs ?? ' spans="1:1"'

  const total = Math.max(options.rows.length, region.length)
  const out: string[] = header.map((r) => r.raw)

  for (let i = 0; i < total; i++) {
    const rowIndex = options.dataStartRow + i
    // Beyond the template's own styled rows, keep cloning the last one so an
    // unusually long week still looks like the rest of the sheet.
    const pattern = region[i] ?? lastPattern
    const rendered = renderRow(
      rowIndex,
      pattern?.attrs ?? modelAttrs,
      pattern?.styles ?? fallback,
      fallback,
      options.rows[i],
    )
    if (rendered) out.push(rendered)
  }

  const lastRow = options.dataStartRow + total - 1
  let sheet = before + out.join('') + after
  sheet = stripDataRegionHyperlinks(sheet, options.dataStartRow)
  sheet = updateDimension(sheet, Math.max(lastRow, options.dataStartRow))
  return sheet
}

// ---------------------------------------------------------------------------
// Archive handling
// ---------------------------------------------------------------------------

/** Resolve the path of the first worksheet through the workbook relationships. */
function resolveFirstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = files['xl/workbook.xml']
  const rels = files['xl/_rels/workbook.xml.rels']
  const fallback = 'xl/worksheets/sheet1.xml'
  if (!workbook || !rels) return fallback

  const sheetTag = /<sheet\b[^>]*>/.exec(strFromU8(workbook))?.[0]
  const relId = sheetTag ? attr(sheetTag, 'r:id') : undefined
  if (!relId) return fallback

  const relsXml = strFromU8(rels)
  const rel = new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*>`).exec(relsXml)?.[0]
  const target = rel ? attr(rel, 'Target') : undefined
  if (!target) return fallback

  const normalised = target.replace(/^\/xl\//, '').replace(/^\.\//, '')
  const path = normalised.startsWith('xl/') ? normalised : `xl/${normalised}`
  return files[path] ? path : fallback
}

/**
 * Write `rows` into a copy of `template`, returning a new .xlsx.
 *
 * Every part of the archive other than the worksheet is passed through unmodified,
 * so embedded images and styling survive intact.
 */
export function fillTemplate(template: Uint8Array, options: FillOptions): Uint8Array {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(template)
  } catch {
    throw new Error('The company template is not a readable .xlsx file')
  }

  const sheetPath = resolveFirstSheetPath(files)
  const sheetBytes = files[sheetPath]
  if (!sheetBytes) throw new Error('The company template has no readable worksheet')

  files[sheetPath] = strToU8(fillWorksheet(strFromU8(sheetBytes), options))

  return zipSync(files, { level: 6 })
}

/**
 * Read the template's header row so the pack builder can show which columns exist
 * without anyone having to describe the file by hand.
 */
export function readHeaderRow(template: Uint8Array, headerRow: number): string[] {
  const files = unzipSync(template)
  const sheetPath = resolveFirstSheetPath(files)
  const sheetBytes = files[sheetPath]
  if (!sheetBytes) return []
  const sheetXml = strFromU8(sheetBytes)

  const shared = files['xl/sharedStrings.xml']
  const strings: string[] = []
  if (shared) {
    for (const si of strFromU8(shared).match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []
      strings.push(
        parts
          .map((p) => p.replace(/<[^>]+>/g, ''))
          .join('')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      )
    }
  }

  const rowMatch = new RegExp(`<row\\b[^>]*\\br="${headerRow}"[^>]*>([\\s\\S]*?)</row>`).exec(
    sheetXml,
  )
  if (!rowMatch) return []

  const headers: string[] = []
  CELL_RE.lastIndex = 0
  let c: RegExpExecArray | null
  while ((c = CELL_RE.exec(rowMatch[1]!))) {
    const cAttrs = c[1] ?? c[2] ?? ''
    const body = c[3] ?? ''
    const ref = attr(cAttrs, 'r')
    const parsed = ref ? parseRef(ref) : undefined
    if (!parsed) continue
    const type = attr(cAttrs, 't')
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
    let value = ''
    if (type === 's' && v !== undefined) value = strings[Number(v)] ?? ''
    else if (type === 'inlineStr') value = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? ''
    else value = v ?? ''
    headers[parsed.col] = value.trim()
  }
  return headers
}
