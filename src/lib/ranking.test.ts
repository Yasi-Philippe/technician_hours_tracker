import { describe, expect, it } from 'vitest'
import { countUsage, rankOptions, type Usage } from './ranking'

const usageOf = (pairs: [string, number, number?][]): Map<string, Usage> =>
  new Map(pairs.map(([value, count, lastUsed]) => [value.toLowerCase(), { count, lastUsed: lastUsed ?? 0 }]))

describe('counting what has been used', () => {
  it('counts each value and remembers when it was last seen', () => {
    const usage = countUsage(
      [
        { v: 'A', t: 10 },
        { v: 'B', t: 20 },
        { v: 'A', t: 30 },
      ],
      (i) => i.v,
      (i) => i.t,
    )
    expect(usage.get('a')).toEqual({ count: 2, lastUsed: 30 })
    expect(usage.get('b')).toEqual({ count: 1, lastUsed: 20 })
  })

  it('treats the same value in different capitals as one', () => {
    const usage = countUsage(
      [
        { v: 'Nord', t: 1 },
        { v: 'NORD', t: 2 },
      ],
      (i) => i.v,
      (i) => i.t,
    )
    expect(usage.size).toBe(1)
    expect(usage.get('nord')!.count).toBe(2)
  })

  it('ignores blanks', () => {
    const usage = countUsage([{ v: '  ', t: 1 }], (i) => i.v, (i) => i.t)
    expect(usage.size).toBe(0)
  })
})

describe('ranking the choices', () => {
  const packList = ['PB01', 'PB02', 'PB03']
  const own = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']

  it('always shows every value the company file lists, in its own order', () => {
    // Even when the technician's own values are used far more often.
    const { shown } = rankOptions({
      fromPack: packList,
      custom: own,
      usage: usageOf([['C5', 20], ['C2', 15]]),
      visibleCustom: 2,
      extraCustom: 2,
    })
    expect(shown.slice(0, 3)).toEqual(['PB01', 'PB02', 'PB03'])
  })

  it('never hides a company value behind Altro…', () => {
    const many = Array.from({ length: 13 }, (_, i) => `PB${String(i + 1).padStart(2, '0')}`)
    const { shown, more } = rankOptions({
      fromPack: many,
      custom: [],
      usage: new Map(),
      visibleCustom: 2,
      extraCustom: 5,
    })
    expect(shown).toEqual(many)
    expect(more).toEqual([])
  })

  it('ranks the technician’s own values by use and caps them', () => {
    const { shown, more } = rankOptions({
      fromPack: packList,
      custom: own,
      usage: usageOf([['C5', 9], ['C2', 5], ['C4', 3]]),
      visibleCustom: 2,
      extraCustom: 2,
    })
    // Company values first, then the two most-used personal ones.
    expect(shown).toEqual(['PB01', 'PB02', 'PB03', 'C5', 'C2'])
    expect(more).toEqual(['C4', 'C1'])
  })

  it('breaks ties on how recently a value was used', () => {
    const { shown } = rankOptions({
      fromPack: [],
      custom: own,
      usage: usageOf([['C3', 2, 100], ['C6', 2, 500]]),
      visibleCustom: 2,
      extraCustom: 0,
    })
    expect(shown).toEqual(['C6', 'C3'])
  })

  it('never hides the value that is currently chosen', () => {
    const { shown } = rankOptions({
      fromPack: [],
      custom: own,
      usage: usageOf([['C1', 9], ['C2', 8], ['C3', 7]]),
      pinned: 'C6',
      visibleCustom: 3,
      extraCustom: 2,
    })
    expect(shown).toContain('C6')
    expect(shown).toHaveLength(3)
  })

  it('does not repeat the chosen value when it is already on screen', () => {
    const { shown } = rankOptions({
      fromPack: packList,
      custom: own,
      usage: new Map(),
      pinned: 'PB02',
      visibleCustom: 2,
      extraCustom: 2,
    })
    expect(shown.filter((v) => v === 'PB02')).toHaveLength(1)
  })

  it('caps what hides behind Altro… as well', () => {
    const { shown, more } = rankOptions({
      fromPack: [],
      custom: own,
      usage: new Map(),
      visibleCustom: 2,
      extraCustom: 3,
    })
    expect(shown).toHaveLength(2)
    expect(more).toHaveLength(3)
    // Six candidates, five offered: the last is typeable but not listed.
    expect(shown.length + more.length).toBe(5)
  })

  it('keeps a recent one-off reachable, but below everything used more', () => {
    const { shown, more } = rankOptions({
      fromPack: [],
      custom: [...own, 'PARCCO'],
      usage: usageOf([['C1', 6, 900], ['C2', 4, 800], ['PARCCO', 1, 100]]),
      visibleCustom: 2,
      extraCustom: 3,
    })
    expect(shown).toEqual(['C1', 'C2'])
    expect(more[0]).toBe('PARCCO')
  })

  it('forgets a one-off entirely once it falls outside the window', () => {
    // The caller passes only recent entries, so an old value simply has no usage. Past
    // the cap it disappears — which is how a typo disposes of itself.
    const { shown, more } = rankOptions({
      fromPack: [],
      custom: [...own, 'PARCCO'],
      usage: usageOf([['C1', 6, 900], ['C2', 4, 800]]),
      visibleCustom: 2,
      extraCustom: 3,
    })
    expect(shown).toEqual(['C1', 'C2'])
    expect([...shown, ...more]).not.toContain('PARCCO')
  })

  it('drops blanks and duplicates, including across the two lists', () => {
    const { shown } = rankOptions({
      fromPack: ['A', '  ', 'B'],
      custom: ['a', 'C'],
      usage: new Map(),
      visibleCustom: 5,
      extraCustom: 5,
    })
    expect(shown).toEqual(['A', 'B', 'C'])
  })
})
