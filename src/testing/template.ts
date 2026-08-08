/**
 * Shared access to a real company template for the tests that need one.
 *
 * The template is never committed, so it is absent on every CI runner and on any clean
 * checkout. Those suites have to skip — but skipping is subtler than it looks:
 *
 *   `describe.skip(name, fn)` still CALLS `fn`, because that is how the runner discovers
 *   which tests to report as skipped. Only the tests themselves are skipped.
 *
 * So a `readFileSync` sitting directly in a suite body runs even when the suite is
 * skipped, and throws. Every read here is therefore deferred behind a function that no
 * skipped test ever calls.
 *
 * Point TEMPLATE_PATH at a file to run these suites somewhere else.
 */

import { describe } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const TEMPLATE_PATH =
  process.env.TEMPLATE_PATH ?? resolve(process.cwd(), 'Template_Type.xlsx')

export const hasTemplate = existsSync(TEMPLATE_PATH)

/** Use in place of `describe` for a suite that cannot run without a template. */
export const withTemplate = hasTemplate ? describe : describe.skip

let cachedBytes: Uint8Array | undefined

/** The template, read on first use and reused afterwards. Never called when skipped. */
export function templateBytes(): Uint8Array {
  cachedBytes ??= new Uint8Array(readFileSync(TEMPLATE_PATH))
  return cachedBytes
}

/**
 * Memoise anything derived from the template — a base64 copy, a built pack — so it is
 * computed once, lazily, rather than in a suite body.
 */
export function lazy<T>(build: () => T): () => T {
  let value: T
  let built = false
  return () => {
    if (!built) {
      value = build()
      built = true
    }
    return value
  }
}
