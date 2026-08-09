/**
 * Guards the one rule this repository must never break: no company data in the source.
 *
 * The check does not contain a list of forbidden words — that would put the very names
 * it protects into the repository. Instead it reads the Company Pack installed on this
 * machine, which is gitignored, and asserts that nothing from it appears in any file git
 * would commit.
 *
 * Comments and test fixtures are where this actually goes wrong. Real project names had
 * already reached two committed files as casual examples ("so `<project>` typed twice…")
 * before this test existed — plausible-looking prose that no reviewer would notice.
 *
 * Skips when no pack is present, so CI and a clean checkout still pass.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

/** Where a built pack normally lands. Override with COMPANY_PACK. */
function findPack(): string | undefined {
  if (process.env.COMPANY_PACK && existsSync(process.env.COMPANY_PACK)) {
    return process.env.COMPANY_PACK
  }
  const downloads = resolve(homedir(), 'Downloads')
  if (!existsSync(downloads)) return undefined
  try {
    const names = execFileSync('ls', [downloads], { encoding: 'utf8' }).split('\n')
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const path = resolve(downloads, name)
      if (statSync(path).size > 10_000 && readFileSync(path, 'utf8').includes('templateBase64')) {
        return path
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Every file git would include in a commit. */
function committableFiles(): string[] {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
  return [...tracked.split('\n'), ...untracked.split('\n')]
    .map((f) => f.trim())
    .filter((f) => f !== '' && existsSync(f) && statSync(f).isFile())
}

/**
 * The words that must not appear: every value the pack supplies, plus the individual
 * words of multi-word names, so "LATERA" is caught inside "LATERA/PIANSANO".
 */
function forbiddenTerms(packPath: string): string[] {
  const pack = JSON.parse(readFileSync(packPath, 'utf8'))
  const raw: string[] = [
    ...(pack.lists?.projects ?? []),
    ...(pack.lists?.sections ?? []),
    ...(pack.lists?.colleagues ?? []).flatMap((p: { name?: string; email?: string }) => [
      p.name ?? '',
      p.email ?? '',
    ]),
    pack.constants?.impresa ?? '',
    pack.constants?.cliente ?? '',
    pack.emailDomain ?? '',
    pack.label ?? '',
  ]

  const terms = new Set<string>()
  for (const value of raw) {
    for (const word of String(value).split(/[\s/,;@]+/)) {
      const cleaned = word.trim().replace(/^\.+|\.+$/g, '')
      // Short or generic words would match ordinary code; only distinctive ones count.
      if (cleaned.length >= 5) terms.add(cleaned.toLowerCase())
    }
  }
  // Intervention types are deliberately excluded: they are industry vocabulary, not
  // company identity, and the app ships no list of its own anyway.
  return [...terms]
}

const packPath = findPack()
const withPack = packPath ? describe : describe.skip

withPack('no company data reaches the repository', () => {
  it('finds nothing from the company pack in any committable file', () => {
    const terms = forbiddenTerms(packPath!)
    expect(terms.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of committableFiles()) {
      // This test names the terms only in memory; skip itself to avoid a false positive.
      if (file.endsWith('leaks.test.ts')) continue
      let contents: string
      try {
        contents = readFileSync(file, 'utf8').toLowerCase()
      } catch {
        continue
      }
      for (const term of terms) {
        if (contents.includes(term)) offenders.push(`${file} contains a company term`)
      }
    }

    expect(offenders).toEqual([])
  })
})
