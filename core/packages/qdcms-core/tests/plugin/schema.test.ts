/**
 * Plugin Valibot schema + validatePlugin — boundary validation tests.
 *
 * Coverage focus :
 * - Happy path : a minimal valid Plugin parses and types
 * - Identity rejection : id regex, version semver, prefix regex, name regex
 * - Topology shapes : requires/replaces arrays of strings, weight number
 * - Contributions are arrays
 * - install/uninstall are mandatory functions
 * - Optional hooks tolerated
 * - Aggregated PluginValidationError carries all issues
 */

import { describe, expect, it } from 'vitest'
import {
  PluginSchema,
  PluginValidationError,
  validatePlugin,
  type Plugin,
} from '../../src/plugin'

const baseValid = (): Record<string, unknown> => ({
  id: '@quazardous/qdcms-plugin-dc',
  version: '0.1.0',
  prefix: 'dc',
  name: 'dc',
  configSchemas: [],
  entities: [],
  migrations: [],
  install: async () => {},
  uninstall: async () => {},
})

describe('validatePlugin — happy path', () => {
  it('accepts a minimal valid plugin', () => {
    const plugin = validatePlugin(baseValid())
    expect(plugin.id).toBe('@quazardous/qdcms-plugin-dc')
    expect(plugin.prefix).toBe('dc')
    expect(plugin.name).toBe('dc')
  })

  it('accepts optional topology fields', () => {
    const plugin = validatePlugin({
      ...baseValid(),
      requires: ['config', 'auth'],
      replaces: ['search'],
      weight: 10,
    })
    expect(plugin.requires).toEqual(['config', 'auth'])
    expect(plugin.replaces).toEqual(['search'])
    expect(plugin.weight).toBe(10)
  })

  it('accepts optional dropsConfigSchemas', () => {
    const plugin = validatePlugin({
      ...baseValid(),
      dropsConfigSchemas: ['auth.password-policy'],
    })
    expect(plugin.dropsConfigSchemas).toEqual(['auth.password-policy'])
  })

  it('accepts optional connect/disconnect/registerHttpRoutes', () => {
    const plugin = validatePlugin({
      ...baseValid(),
      connect: async () => {},
      disconnect: async () => {},
      registerHttpRoutes: () => {},
    })
    expect(typeof plugin.connect).toBe('function')
    expect(typeof plugin.disconnect).toBe('function')
    expect(typeof plugin.registerHttpRoutes).toBe('function')
  })
})

describe('validatePlugin — rejection', () => {
  it('rejects non-objects', () => {
    expect(() => validatePlugin(null)).toThrow(PluginValidationError)
    expect(() => validatePlugin('string')).toThrow(PluginValidationError)
    expect(() => validatePlugin(42)).toThrow(PluginValidationError)
  })

  it('rejects invalid id', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), id: 'BadCase' }),
    ).toThrow(/id must be/)
  })

  it('rejects invalid version (not semver)', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), version: '1.0' }),
    ).toThrow(/semver/)
  })

  it('rejects v-prefixed version', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), version: 'v1.0.0' }),
    ).toThrow(/semver/)
  })

  it('rejects prefix with dashes', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), prefix: 'my-shop' }),
    ).toThrow(/no dashes/)
  })

  it('rejects name starting with digit', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), name: '9foo' }),
    ).toThrow(/name must be/)
  })

  it('rejects missing install', () => {
    const { install: _omit, ...rest } = baseValid()
    expect(() => validatePlugin(rest)).toThrow(PluginValidationError)
  })

  it('rejects non-function install', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), install: 'not a fn' }),
    ).toThrow(/install must be a function/)
  })

  it('rejects requires that is not a string array', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), requires: [42] }),
    ).toThrow(PluginValidationError)
  })

  it('rejects weight that is not a number', () => {
    expect(() =>
      validatePlugin({ ...baseValid(), weight: 'high' }),
    ).toThrow(/weight must be a number/)
  })

  it('aggregates multiple issues into one error', () => {
    try {
      validatePlugin({
        ...baseValid(),
        id: 'BAD',
        prefix: 'x-y',
        version: 'nope',
      })
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError)
      const err = e as PluginValidationError
      expect(err.issues.length).toBeGreaterThanOrEqual(2)
      // Message contains all the failed fields.
      expect(err.message).toMatch(/id/)
      expect(err.message).toMatch(/version/)
      expect(err.message).toMatch(/prefix/)
      return
    }
    expect.fail('should have thrown')
  })

  it('attaches the plugin id to the error when discoverable', () => {
    try {
      validatePlugin({ ...baseValid(), version: 'nope' })
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError)
      expect((e as PluginValidationError).pluginId).toBe(
        '@quazardous/qdcms-plugin-dc',
      )
      return
    }
    expect.fail('should have thrown')
  })
})

describe('Plugin type — structural sanity', () => {
  it('a class implementing Plugin compiles + validates', () => {
    class FakePlugin implements Plugin {
      readonly id = '@x/qdcms-plugin-fake'
      readonly version = '1.0.0'
      readonly prefix = 'fake'
      readonly name = 'fake'
      readonly configSchemas = []
      readonly entities = []
      readonly migrations = []
      async install() {}
      async uninstall() {}
    }
    const instance = new FakePlugin()
    const validated = validatePlugin(instance)
    expect(validated.name).toBe('fake')
  })
})

describe('PluginSchema — exposed for advanced usage', () => {
  it('is a Valibot schema (has _run / kind)', () => {
    expect(PluginSchema).toBeDefined()
    // Valibot schemas are objects with a `kind` of 'schema'.
    expect((PluginSchema as { kind?: string }).kind).toBe('schema')
  })
})
