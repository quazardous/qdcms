/**
 * registerSources — kernel registration helper.
 *
 * Coverage focus :
 * - Modules : accepts both class references and instances
 * - Plugins : flows through validatePlugin (caught at registerPlugin)
 * - Order : modules registered before plugins (so plugin requires
 *   resolves against an already-populated kernel)
 * - Empty / partial sources are tolerated
 */

import { describe, expect, it } from 'vitest'
import { Kernel, registerSources } from '../../src/kernel'
import { Module } from '../../src/module'
import type { Plugin } from '../../src/plugin'

class ConfigModule extends Module {
  static moduleName = 'config'
}

class AuthModule extends Module {
  static moduleName = 'auth'
  static requires = ['config']
}

const validPlugin = (overrides: Partial<Plugin> = {}): Plugin => ({
  id: '@x/qdcms-plugin-test',
  version: '1.0.0',
  prefix: 'test',
  name: 'test',
  configSchemas: [],
  entities: [],
  migrations: [],
  install: async () => {},
  uninstall: async () => {},
  ...overrides,
})

describe('registerSources', () => {
  it('instantiates Module classes and registers them', () => {
    const k = new Kernel()
    registerSources(k, { modules: [ConfigModule, AuthModule] })
    expect(k.get('config')).toBeInstanceOf(ConfigModule)
    expect(k.get('auth')).toBeInstanceOf(AuthModule)
  })

  it('accepts already-instantiated modules', () => {
    const k = new Kernel()
    const inst = new ConfigModule({ name: 'config' })
    registerSources(k, { modules: [inst] })
    expect(k.get('config')).toBe(inst)
  })

  it('mixes class and instance entries in the same call', () => {
    const k = new Kernel()
    const auth = new AuthModule()
    registerSources(k, { modules: [ConfigModule, auth] })
    expect(k.get('config')).toBeInstanceOf(ConfigModule)
    expect(k.get('auth')).toBe(auth)
  })

  it('registers plugins (validation runs)', () => {
    const k = new Kernel()
    registerSources(k, { plugins: [validPlugin()] })
    expect(k.get('test')).toBeDefined()
  })

  it('rejects malformed plugins via validatePlugin', () => {
    const k = new Kernel()
    expect(() =>
      registerSources(k, {
        plugins: [{ id: 'BAD CASE' } as unknown as Plugin],
      }),
    ).toThrow()
  })

  it('registers modules first so plugins can require them', () => {
    const k = new Kernel()
    registerSources(k, {
      modules: [ConfigModule],
      plugins: [validPlugin({ name: 'test', requires: ['config'] })],
    })
    // Topo : config before test.
    expect(k.topoSort()).toEqual(['config', 'test'])
  })

  it('tolerates empty / partial sources', () => {
    const k = new Kernel()
    registerSources(k, {})
    registerSources(k, { modules: [] })
    registerSources(k, { plugins: [] })
    expect(k.list()).toHaveLength(0)
  })
})
