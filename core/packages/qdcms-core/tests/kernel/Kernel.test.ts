/**
 * Kernel — registration, slot chains, queries, topo sort, conflicts.
 *
 * Coverage focus :
 * - registerModule : adds Module instance to its own slot
 * - registerPlugin : layers on own slot + every replaces target
 * - get / slot / list / replaced / replacedChain
 * - chain ordering by weight (sorted insertion)
 * - active = top of chain
 * - conflict : same slot + same weight = fatal
 * - topoSort : modules + plugins + cycles + missing requires
 * - validatePlugin runs on registerPlugin (skipValidation skips it)
 */

import { describe, expect, it } from 'vitest'
import {
  Kernel,
  KernelChainConflictError,
  KernelCycleError,
  KernelDependencyError,
} from '../../src/kernel'
import { Module } from '../../src/module'
import type { Plugin } from '../../src/plugin'

// ─── Test helpers ────────────────────────────────────────────────────────

class NamedModule extends Module {
  static moduleName = 'override-me'
}
function makeModule(name: string, requires: readonly string[] = []) {
  class M extends Module {
    static moduleName = name
    static requires = requires
  }
  return new M()
}

function makePlugin(opts: {
  id?: string
  name: string
  prefix?: string
  version?: string
  requires?: readonly string[]
  replaces?: readonly string[]
  weight?: number
}): Plugin {
  return {
    id: opts.id ?? `@test/qdcms-plugin-${opts.name}`,
    version: opts.version ?? '1.0.0',
    prefix: opts.prefix ?? opts.name,
    name: opts.name,
    requires: opts.requires,
    replaces: opts.replaces,
    weight: opts.weight,
    configSchemas: [],
    entities: [],
    migrations: [],
    install: async () => {},
    uninstall: async () => {},
  }
}

// ─── registerModule ──────────────────────────────────────────────────────

describe('Kernel — registerModule', () => {
  it('puts the module instance in a slot keyed by static moduleName', () => {
    const k = new Kernel()
    k.registerModule(makeModule('config'))
    expect(k.get('config')).toBeDefined()
    expect(k.list()).toHaveLength(1)
    expect(k.slot('config')!.chain).toHaveLength(1)
    expect(k.slot('config')!.chain[0].citizenship).toBe('module')
    expect(k.slot('config')!.chain[0].weight).toBe(0)
  })

  it('rejects modules without a real moduleName', () => {
    const k = new Kernel()
    class Vanilla extends Module {}
    expect(() => k.registerModule(new Vanilla())).toThrow(KernelDependencyError)
  })

  it("respects the caller's origin override", () => {
    const k = new Kernel()
    k.registerModule(makeModule('foo'), { origin: 'custom-origin' })
    expect(k.slot('foo')!.chain[0].origin).toBe('custom-origin')
  })
})

// ─── registerPlugin ──────────────────────────────────────────────────────

describe('Kernel — registerPlugin', () => {
  it('adds the plugin under its own name slot', () => {
    const k = new Kernel()
    k.registerPlugin(makePlugin({ name: 'dc' }))
    expect(k.get('dc')).toBeDefined()
    expect(k.slot('dc')!.chain[0].citizenship).toBe('plugin')
  })

  it('layers the plugin onto every slot in `replaces`', () => {
    const k = new Kernel()
    k.registerPlugin(
      makePlugin({
        name: 'elastic',
        replaces: ['search', 'indexer', 'fulltext'],
      }),
    )
    expect(k.list().map((s) => s.name).sort()).toEqual([
      'elastic',
      'fulltext',
      'indexer',
      'search',
    ])
    expect(k.get('search')).toBe(k.get('elastic'))
  })

  it('chain-orders multiple plugins on the same slot by ascending weight', () => {
    const k = new Kernel()
    const base = makeModule('auth')
    k.registerModule(base)
    const mfa = makePlugin({ name: 'mfa', replaces: ['auth'], weight: 10 })
    const audit = makePlugin({ name: 'audit', replaces: ['auth'], weight: 20 })
    k.registerPlugin(audit) // higher weight registered first
    k.registerPlugin(mfa)
    const chain = k.slot('auth')!.chain
    expect(chain.map((e) => e.weight)).toEqual([0, 10, 20])
    // active = top of chain = highest weight = audit
    expect(k.get('auth')).toBe(audit)
  })

  it('throws KernelChainConflictError on same-weight collision', () => {
    const k = new Kernel()
    k.registerPlugin(makePlugin({ name: 'auth', weight: 0 }))
    expect(() =>
      k.registerPlugin(
        makePlugin({ name: 'mfa', replaces: ['auth'], weight: 0 }),
      ),
    ).toThrow(KernelChainConflictError)
  })

  it('rejects malformed plugins via validatePlugin', () => {
    const k = new Kernel()
    expect(() =>
      k.registerPlugin({ id: 'not-an-id', name: 'x' } as unknown as Plugin),
    ).toThrow()
  })

  it('skipValidation lets the caller bypass the schema (e.g. tests)', () => {
    const k = new Kernel()
    // Minimal but invalid (missing functions etc.) — only passes because we skip
    expect(() =>
      k.registerPlugin(
        { name: 'bypass' } as unknown as Plugin,
        { skipValidation: true },
      ),
    ).not.toThrow()
  })
})

// ─── replaced / replacedChain ────────────────────────────────────────────

describe('Kernel — replaced helper', () => {
  it('returns the immediately-below instance for a wrapping plugin', () => {
    const k = new Kernel()
    const base = makeModule('auth')
    k.registerModule(base)
    const mfa = makePlugin({ name: 'mfa', replaces: ['auth'], weight: 10 })
    k.registerPlugin(mfa)
    expect(k.replaced('auth', mfa)).toBe(base)
  })

  it('returns undefined for the bottom-of-chain caller', () => {
    const k = new Kernel()
    const base = makeModule('auth')
    k.registerModule(base)
    expect(k.replaced('auth', base)).toBeUndefined()
  })

  it('replacedChain returns every predecessor bottom-to-top', () => {
    const k = new Kernel()
    const base = makeModule('auth')
    const mfa = makePlugin({ name: 'mfa', replaces: ['auth'], weight: 10 })
    const audit = makePlugin({ name: 'audit', replaces: ['auth'], weight: 20 })
    k.registerModule(base)
    k.registerPlugin(mfa)
    k.registerPlugin(audit)
    expect(k.replacedChain('auth', audit)).toEqual([base, mfa])
  })

  it('returns undefined when the caller is in a different slot', () => {
    const k = new Kernel()
    const base = makeModule('auth')
    const other = makePlugin({ name: 'other' })
    k.registerModule(base)
    k.registerPlugin(other)
    expect(k.replaced('auth', other)).toBeUndefined()
  })
})

// ─── topoSort ────────────────────────────────────────────────────────────

describe('Kernel — topoSort', () => {
  it('returns a single registered module', () => {
    const k = new Kernel()
    k.registerModule(makeModule('config'))
    expect(k.topoSort()).toEqual(['config'])
  })

  it('places dependency before dependent', () => {
    const k = new Kernel()
    k.registerModule(makeModule('config'))
    k.registerPlugin(makePlugin({ name: 'dc', requires: ['config'] }))
    const order = k.topoSort()
    expect(order.indexOf('config')).toBeLessThan(order.indexOf('dc'))
  })

  it('handles a chain a → b → c', () => {
    const k = new Kernel()
    k.registerModule(makeModule('a'))
    k.registerModule(makeModule('b', ['a']))
    k.registerModule(makeModule('c', ['b']))
    expect(k.topoSort()).toEqual(['a', 'b', 'c'])
  })

  it('handles a diamond (d depends on b and c ; b and c depend on a)', () => {
    const k = new Kernel()
    k.registerModule(makeModule('a'))
    k.registerModule(makeModule('b', ['a']))
    k.registerModule(makeModule('c', ['a']))
    k.registerModule(makeModule('d', ['b', 'c']))
    const order = k.topoSort()
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('throws on missing requires', () => {
    const k = new Kernel()
    k.registerPlugin(makePlugin({ name: 'dc', requires: ['ghost'] }))
    expect(() => k.topoSort()).toThrow(KernelDependencyError)
  })

  it('throws on direct cycle a → b → a', () => {
    const k = new Kernel()
    k.registerModule(makeModule('a', ['b']))
    k.registerModule(makeModule('b', ['a']))
    expect(() => k.topoSort()).toThrow(KernelCycleError)
  })

  it('uses the active instance for requires resolution after replace', () => {
    // Base 'auth' has no deps. A wrapping plugin 'mfa' replaces auth and
    // requires 'config'. After registration, the active 'auth' is mfa,
    // and topoSort must see the mfa requires (not the base's).
    const k = new Kernel()
    k.registerModule(makeModule('config'))
    k.registerModule(makeModule('auth')) // no deps
    k.registerPlugin(
      makePlugin({
        name: 'mfa',
        replaces: ['auth'],
        weight: 10,
        requires: ['config'],
      }),
    )
    const order = k.topoSort()
    expect(order.indexOf('config')).toBeLessThan(order.indexOf('auth'))
  })
})
