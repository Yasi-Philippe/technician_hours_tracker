/**
 * Which choices are worth showing, and which can wait behind "Altro…".
 *
 * A pick list that remembers everything becomes unusable at exactly the moment it should
 * be paying off: two weeks of varied work and every field is a wall of options. Asking
 * the technician to prune it by hand would spend the time the feature exists to save.
 *
 * So the list ranks itself by what has actually been used recently. Three tiers:
 *
 *   1. the handful used most — always on screen
 *   2. the next few — one tap away, behind "Altro…"
 *   3. everything else — still typeable, but not offered
 *
 * Anything that falls out of use drifts down and eventually disappears on its own, which
 * also quietly disposes of typos: a value typed once and never again is gone within the
 * window. Nothing has to be deleted.
 */

/** How often a value was used, and when it was last seen. */
export interface Usage {
  count: number
  lastUsed: number
}

export interface RankedOptions {
  /** Always visible. */
  shown: string[]
  /** Revealed by "Altro…". */
  more: string[]
}

const key = (value: string) => value.trim().toLowerCase()

/**
 * Count how often each value appears, and when it was last used.
 *
 * The caller decides the window — a month of entries is the intended input. A shorter
 * window forgets faster; a longer one keeps rarely-used values alive.
 */
export function countUsage<T>(
  items: readonly T[],
  valueOf: (item: T) => string,
  timeOf: (item: T) => number,
): Map<string, Usage> {
  const usage = new Map<string, Usage>()
  for (const item of items) {
    const value = valueOf(item).trim()
    if (value === '') continue
    const current = usage.get(key(value))
    usage.set(key(value), {
      count: (current?.count ?? 0) + 1,
      lastUsed: Math.max(current?.lastUsed ?? 0, timeOf(item)),
    })
  }
  return usage
}

export interface RankOptions {
  /**
   * The company's own values. Always shown, always in the order the company wrote them.
   *
   * These are not the ones that pile up — a pack lists a fixed set, and the technician
   * learns where each sits. Ranking them would move PB07 above PB01 the week it got
   * busy, which is churn for no gain.
   */
  fromPack: string[]
  /** Values the technician typed. These accumulate, so these are what get ranked. */
  custom: string[]
  /** Usage over the recent window, keyed by the value. */
  usage: Map<string, Usage>
  /** The value currently chosen. Always visible, so the choice is never hidden. */
  pinned?: string
  /** How many of the technician's own values stay on screen. */
  visibleCustom: number
  /** How many more are reachable behind "Altro…". */
  extraCustom: number
}

/**
 * Split the candidates into what to show and what to tuck away.
 *
 * The company's values are never hidden. Only the technician's own additions are ranked
 * and capped, because only those grow without bound — and a value that stops being used
 * sinks, then leaves the window, and is gone without anyone deleting it.
 */
export function rankOptions({
  fromPack,
  custom,
  usage,
  pinned,
  visibleCustom,
  extraCustom,
}: RankOptions): RankedOptions {
  const seen = new Set<string>()
  const take = (values: readonly string[]) => {
    const out: string[] = []
    for (const value of values) {
      const trimmed = value.trim()
      if (trimmed === '' || seen.has(key(trimmed))) continue
      seen.add(key(trimmed))
      out.push(trimmed)
    }
    return out
  }

  const pack = take(fromPack)
  const own = take(custom)

  const position = new Map(own.map((value, index) => [key(value), index]))
  const ranked = [...own].sort((a, b) => {
    const ua = usage.get(key(a))
    const ub = usage.get(key(b))
    const byCount = (ub?.count ?? 0) - (ua?.count ?? 0)
    if (byCount !== 0) return byCount
    const byRecency = (ub?.lastUsed ?? 0) - (ua?.lastUsed ?? 0)
    if (byRecency !== 0) return byRecency
    return (position.get(key(a)) ?? 0) - (position.get(key(b)) ?? 0)
  })

  const shownCustom = ranked.slice(0, Math.max(visibleCustom, 0))

  // Whatever is selected must be on screen, or the technician cannot see their own
  // choice — including an old value that has otherwise dropped off the list.
  const chosen = pinned?.trim()
  if (chosen && !pack.some((v) => key(v) === key(chosen)) && !shownCustom.some((v) => key(v) === key(chosen))) {
    if (shownCustom.length >= visibleCustom && shownCustom.length > 0) shownCustom.pop()
    shownCustom.push(chosen)
    if (!seen.has(key(chosen))) seen.add(key(chosen))
  }

  const inShown = new Set(shownCustom.map(key))
  const more = ranked.filter((value) => !inShown.has(key(value))).slice(0, Math.max(extraCustom, 0))

  return { shown: [...pack, ...shownCustom], more }
}
