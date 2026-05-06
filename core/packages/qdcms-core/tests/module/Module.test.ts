/**
 * Module — base class smoke tests.
 *
 * Coverage focus :
 * - Default static fields (qdadm-existing + qdcms additions)
 * - Name resolution (options.name > own static moduleName > inherited)
 * - Default lifecycle no-ops don't throw
 * - Subclass overrides static + instance hooks
 * - loadStyles / disconnect cleanup behaviour
 */

import { describe, expect, it, vi } from 'vitest'
import { Module } from '../../src/module'

describe('Module — defaults', () => {
  it('has the qdadm-existing static fields with sensible defaults', () => {
    expect(Module.moduleName).toBe('base')
    expect(Module.requires).toEqual([])
    expect(Module.priority).toBe(0)
    expect(Module.styles).toBeNull()
  })

  it('has the qdcms additions defaulting to empty / null', () => {
    expect(Module.configSchemas).toEqual([])
    expect(Module.cliCommands).toBeNull()
    expect(Module.entities).toEqual([])
    expect(Module.migrations).toEqual([])
  })

  it('default lifecycle hooks are no-ops that resolve cleanly', async () => {
    const m = new Module()
    await expect(m.connect({})).resolves.toBeUndefined()
    await expect(m.disconnect()).resolves.toBeUndefined()
    await expect(m.install({})).resolves.toBeUndefined()
    await expect(m.uninstall({})).resolves.toBeUndefined()
    expect(() => m.registerHttpRoutes(null, {})).not.toThrow()
  })

  it('default enabled() is true', () => {
    const m = new Module()
    expect(m.enabled({})).toBe(true)
  })
})

describe('Module — name resolution', () => {
  it('falls back to inherited moduleName when no override', () => {
    const m = new Module()
    expect(m.name).toBe('base')
  })

  it('uses options.name when provided', () => {
    const m = new Module({ name: 'instance-override' })
    expect(m.name).toBe('instance-override')
  })

  it("prefers a subclass's own static moduleName over inherited", () => {
    class Foo extends Module {
      static moduleName = 'foo'
    }
    expect(new Foo().name).toBe('foo')
  })

  it('options.name beats subclass static moduleName', () => {
    class Foo extends Module {
      static moduleName = 'foo'
    }
    expect(new Foo({ name: 'bar' }).name).toBe('bar')
  })
})

describe('Module — loadStyles', () => {
  it('does nothing when styles is null (default)', async () => {
    const m = new Module()
    await expect(m.loadStyles()).resolves.toBeUndefined()
  })

  it('runs the loader once and caches the result', async () => {
    const loader = vi.fn(async () => ({}))
    class Themed extends Module {
      static styles = loader
    }
    const m = new Themed()
    await m.loadStyles()
    await m.loadStyles()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('catches loader failures with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    class Broken extends Module {
      static moduleName = 'broken'
      static styles = async () => {
        throw new Error('boom')
      }
    }
    await new Broken().loadStyles()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Module — disconnect cleanups', () => {
  it('runs every registered cleanup and clears the list', async () => {
    const m = new Module()
    const a = vi.fn()
    const b = vi.fn()
    m._addSignalCleanup(a)
    m._addSignalCleanup(b)
    await m.disconnect()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    // Re-disconnect → cleanups already cleared, no double-call.
    await m.disconnect()
    expect(a).toHaveBeenCalledTimes(1)
  })
})

describe('Module — qdcms-side overrides compose', () => {
  it('a subclass can declare configSchemas + entities + cliCommands', () => {
    class Cms extends Module {
      static moduleName = 'cms'
      static configSchemas = [
        { namespace: 'cms', concepts: {} } as never,
      ] as const
      static cliCommands = './cli/commands'
      static entities = [
        { name: 'thing', tableName: 'things', fields: {} },
      ] as const
    }
    expect(Cms.configSchemas).toHaveLength(1)
    expect(Cms.cliCommands).toBe('./cli/commands')
    expect(Cms.entities).toHaveLength(1)
  })

  it('install / uninstall / registerHttpRoutes can be overridden', async () => {
    const installs: unknown[] = []
    const uninstalls: unknown[] = []
    const routes: unknown[] = []
    class Backend extends Module {
      static moduleName = 'backend'
      async install(ctx: unknown) {
        installs.push(ctx)
      }
      async uninstall(ctx: unknown) {
        uninstalls.push(ctx)
      }
      registerHttpRoutes(router: unknown, _ctx: unknown) {
        routes.push(router)
      }
    }
    const m = new Backend()
    await m.install({ ctx: 'install' })
    await m.uninstall({ ctx: 'uninstall' })
    m.registerHttpRoutes({ router: 'r' }, {})
    expect(installs).toEqual([{ ctx: 'install' }])
    expect(uninstalls).toEqual([{ ctx: 'uninstall' }])
    expect(routes).toEqual([{ router: 'r' }])
  })
})
