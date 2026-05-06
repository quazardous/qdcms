/**
 * Kernel lifecycle dispatch (M4b).
 *
 * Coverage focus :
 * - collectConfigSchemas : reads from Module statics + Plugin instance
 *   readonly, dedupes by instance (consolidator pattern)
 * - installAll : every chain entry, bottom-to-top, slots in topo order,
 *   instance dedup
 * - uninstallAll : mirror order
 * - registerAllHttpRoutes / connectAll / disconnectAll / loadStylesAll :
 *   active only, dedup
 * - error propagation : a thrown hook stops the iteration
 */

import { describe, expect, it, vi } from 'vitest'
import { Kernel } from '../../src/kernel'
import { Module } from '../../src/module'
import type { Plugin } from '../../src/plugin'

// ─── Test helpers ────────────────────────────────────────────────────────

function makeModule(opts: {
  name: string
  requires?: readonly string[]
  configSchemas?: readonly unknown[]
  install?: (ctx: unknown) => Promise<void>
  uninstall?: (ctx: unknown) => Promise<void>
  connect?: (ctx: unknown) => Promise<void>
  disconnect?: () => Promise<void>
  loadStyles?: () => Promise<void>
  registerHttpRoutes?: (router: unknown, ctx: unknown) => void
}) {
  class M extends Module {
    static moduleName = opts.name
    static requires = opts.requires ?? []
    static configSchemas = (opts.configSchemas ?? []) as never
  }
  const inst = new M()
  if (opts.install) Object.assign(inst, { install: opts.install })
  if (opts.uninstall) Object.assign(inst, { uninstall: opts.uninstall })
  if (opts.connect) Object.assign(inst, { connect: opts.connect })
  if (opts.disconnect) Object.assign(inst, { disconnect: opts.disconnect })
  if (opts.loadStyles) Object.assign(inst, { loadStyles: opts.loadStyles })
  if (opts.registerHttpRoutes)
    Object.assign(inst, { registerHttpRoutes: opts.registerHttpRoutes })
  return inst
}

function makePlugin(opts: {
  id?: string
  name: string
  requires?: readonly string[]
  replaces?: readonly string[]
  weight?: number
  configSchemas?: readonly unknown[]
  install?: (ctx: unknown) => Promise<void>
  uninstall?: (ctx: unknown) => Promise<void>
  connect?: (ctx: unknown) => Promise<void>
  registerHttpRoutes?: (router: unknown, ctx: unknown) => void
}): Plugin {
  return {
    id: opts.id ?? `@test/qdcms-plugin-${opts.name}`,
    version: '1.0.0',
    prefix: opts.name,
    name: opts.name,
    requires: opts.requires,
    replaces: opts.replaces,
    weight: opts.weight,
    configSchemas: (opts.configSchemas ?? []) as never,
    entities: [],
    migrations: [],
    install: opts.install ?? (async () => {}),
    uninstall: opts.uninstall ?? (async () => {}),
    connect: opts.connect,
    registerHttpRoutes: opts.registerHttpRoutes,
  }
}

// ─── collectConfigSchemas ────────────────────────────────────────────────

describe('Kernel — collectConfigSchemas', () => {
  it('aggregates schemas from Module statics + Plugin readonly', () => {
    const k = new Kernel()
    k.registerModule(makeModule({ name: 'config', configSchemas: [{ s: 1 }] }))
    k.registerPlugin(makePlugin({ name: 'dc', configSchemas: [{ s: 2 }] }))
    expect(k.collectConfigSchemas()).toHaveLength(2)
  })

  it('dedupes by instance when a plugin replaces multiple slots', () => {
    const k = new Kernel()
    k.registerModule(makeModule({ name: 'search' }))
    k.registerModule(makeModule({ name: 'indexer' }))
    k.registerPlugin(
      makePlugin({
        name: 'elastic',
        replaces: ['search', 'indexer'],
        weight: 10,
        configSchemas: [{ elastic: true }],
      }),
    )
    // The plugin appears in 3 slots (elastic + search + indexer) but its
    // configSchema should be returned only once.
    const schemas = k.collectConfigSchemas()
    expect(schemas).toEqual([{ elastic: true }])
  })

  it('accumulates schemas from each chain entry (inheritance)', () => {
    const k = new Kernel()
    const base = makeModule({ name: 'auth', configSchemas: [{ a: 'base' }] })
    k.registerModule(base)
    k.registerPlugin(
      makePlugin({
        name: 'mfa',
        replaces: ['auth'],
        weight: 10,
        configSchemas: [{ a: 'mfa' }],
      }),
    )
    expect(k.collectConfigSchemas()).toHaveLength(2)
  })
})

// ─── installAll / uninstallAll ───────────────────────────────────────────

describe('Kernel — installAll', () => {
  it('runs install on every entry in topo order, bottom-to-top per chain', async () => {
    const k = new Kernel()
    const order: string[] = []
    k.registerModule(
      makeModule({
        name: 'config',
        install: async () => {
          order.push('config')
        },
      }),
    )
    k.registerModule(
      makeModule({
        name: 'auth',
        requires: ['config'],
        install: async () => {
          order.push('auth')
        },
      }),
    )
    k.registerPlugin(
      makePlugin({
        name: 'mfa',
        replaces: ['auth'],
        weight: 10,
        install: async () => {
          order.push('mfa')
        },
      }),
    )
    await k.installAll({})
    // config first (no deps), then auth's chain : base then wrapper.
    expect(order).toEqual(['config', 'auth', 'mfa'])
  })

  it('deduplicates by instance when a plugin replaces multiple slots', async () => {
    const k = new Kernel()
    let count = 0
    k.registerModule(makeModule({ name: 'search' }))
    k.registerModule(makeModule({ name: 'indexer' }))
    k.registerPlugin(
      makePlugin({
        name: 'elastic',
        replaces: ['search', 'indexer'],
        weight: 10,
        install: async () => {
          count++
        },
      }),
    )
    await k.installAll({})
    expect(count).toBe(1)
  })

  it('passes the ctx through to every install hook', async () => {
    const k = new Kernel()
    const seen: unknown[] = []
    k.registerModule(
      makeModule({
        name: 'config',
        install: async (ctx) => {
          seen.push(ctx)
        },
      }),
    )
    const ctx = { foo: 'bar' }
    await k.installAll(ctx)
    expect(seen).toEqual([ctx])
  })

  it('propagates errors and stops iteration', async () => {
    const k = new Kernel()
    const ran: string[] = []
    k.registerModule(
      makeModule({
        name: 'a',
        install: async () => {
          ran.push('a')
          throw new Error('boom')
        },
      }),
    )
    k.registerModule(
      makeModule({
        name: 'b',
        requires: ['a'],
        install: async () => {
          ran.push('b')
        },
      }),
    )
    await expect(k.installAll({})).rejects.toThrow('boom')
    expect(ran).toEqual(['a'])
  })
})

describe('Kernel — uninstallAll mirrors installAll', () => {
  it('walks slots reverse-topo and chain top-to-bottom', async () => {
    const k = new Kernel()
    const order: string[] = []
    k.registerModule(
      makeModule({
        name: 'config',
        uninstall: async () => {
          order.push('config')
        },
      }),
    )
    k.registerModule(
      makeModule({
        name: 'auth',
        requires: ['config'],
        uninstall: async () => {
          order.push('auth')
        },
      }),
    )
    k.registerPlugin(
      makePlugin({
        name: 'mfa',
        replaces: ['auth'],
        weight: 10,
        uninstall: async () => {
          order.push('mfa')
        },
      }),
    )
    await k.uninstallAll({})
    // mfa torn down first (top of auth chain), then auth's base, then config.
    expect(order).toEqual(['mfa', 'auth', 'config'])
  })
})

// ─── registerAllHttpRoutes / connectAll / disconnectAll / loadStylesAll ──

describe('Kernel — active-only dispatch', () => {
  it('registerAllHttpRoutes only calls the active of each slot', () => {
    const k = new Kernel()
    const calls: string[] = []
    const base = makeModule({
      name: 'auth',
      registerHttpRoutes: () => {
        calls.push('base')
      },
    })
    const mfa = makePlugin({
      name: 'mfa',
      replaces: ['auth'],
      weight: 10,
      registerHttpRoutes: () => {
        calls.push('mfa')
      },
    })
    k.registerModule(base)
    k.registerPlugin(mfa)
    k.registerAllHttpRoutes(null, {})
    expect(calls).toEqual(['mfa'])
  })

  it('registerAllHttpRoutes dedupes consolidator plugins across slots', () => {
    const k = new Kernel()
    let count = 0
    k.registerModule(makeModule({ name: 'search' }))
    k.registerModule(makeModule({ name: 'indexer' }))
    k.registerPlugin(
      makePlugin({
        name: 'elastic',
        replaces: ['search', 'indexer'],
        weight: 10,
        registerHttpRoutes: () => {
          count++
        },
      }),
    )
    k.registerAllHttpRoutes(null, {})
    expect(count).toBe(1)
  })

  it('connectAll runs in topo order, active only', async () => {
    const k = new Kernel()
    const order: string[] = []
    k.registerModule(
      makeModule({
        name: 'a',
        connect: async () => {
          order.push('a')
        },
      }),
    )
    k.registerModule(
      makeModule({
        name: 'b',
        requires: ['a'],
        connect: async () => {
          order.push('b')
        },
      }),
    )
    await k.connectAll({})
    expect(order).toEqual(['a', 'b'])
  })

  it('disconnectAll mirrors connectAll', async () => {
    const k = new Kernel()
    const order: string[] = []
    k.registerModule(
      makeModule({
        name: 'a',
        disconnect: async () => {
          order.push('a')
        },
      }),
    )
    k.registerModule(
      makeModule({
        name: 'b',
        requires: ['a'],
        disconnect: async () => {
          order.push('b')
        },
      }),
    )
    await k.disconnectAll()
    expect(order).toEqual(['b', 'a'])
  })

  it('loadStylesAll calls loadStyles on each active', async () => {
    const k = new Kernel()
    const a = vi.fn(async () => {})
    const b = vi.fn(async () => {})
    k.registerModule(makeModule({ name: 'a', loadStyles: a }))
    k.registerModule(makeModule({ name: 'b', requires: ['a'], loadStyles: b }))
    await k.loadStylesAll()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
