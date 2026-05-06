/**
 * InMemoryComponentRegistry — pure-function tests.
 *
 * Coverage focus:
 * - Conflict detection (id duplicate, prefix collision)
 * - Dependency resolution (topo sort, missing deps, cycles)
 * - Extension validation (target exists, owner is a declared dep)
 * - State tracking (setState, lastError clearing)
 * - Lookup (findTableOwner, ownership routing)
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  ComponentConflictError,
  ComponentDependencyError,
  ComponentValidationError,
  InMemoryComponentRegistry,
  type ComponentManifest,
} from '../../src/registry'

function makeManifest(input: Partial<ComponentManifest> & { id: string }): ComponentManifest {
  return {
    version: '1.0.0',
    prefix: input.id, // default prefix == id for tests
    ...input,
  } as ComponentManifest
}

let registry: InMemoryComponentRegistry

beforeEach(() => {
  registry = new InMemoryComponentRegistry()
})

describe('register / unregister', () => {
  it('registers a single valid manifest', () => {
    registry.register(makeManifest({ id: 'core' }))
    expect(registry.has('core')).toBe(true)
    expect(registry.list()).toHaveLength(1)
  })

  it('rejects duplicate id', () => {
    registry.register(makeManifest({ id: 'core' }))
    expect(() => registry.register(makeManifest({ id: 'core' }))).toThrow(
      ComponentConflictError,
    )
  })

  it('rejects prefix collision (different ids, same prefix)', () => {
    registry.register(makeManifest({ id: 'core' }))
    expect(() =>
      registry.register(makeManifest({ id: 'other_core', prefix: 'core' })),
    ).toThrow(/prefix "core" collides/)
  })

  it('rejects invalid manifest at register time', () => {
    expect(() =>
      registry.register(makeManifest({ id: 'BadId' })),
    ).toThrow(ComponentValidationError)
  })

  it('unregister removes the entry', () => {
    registry.register(makeManifest({ id: 'core' }))
    registry.unregister('core')
    expect(registry.has('core')).toBe(false)
  })

  it('unregister throws if not present', () => {
    expect(() => registry.unregister('ghost')).toThrow(ComponentDependencyError)
  })

  it('refuses unregister when another manifest depends on it', () => {
    registry.register(makeManifest({ id: 'core' }))
    registry.register(
      makeManifest({
        id: 'shop',
        prefix: 'shop',
        dependencies: [{ id: 'core' }],
      }),
    )
    expect(() => registry.unregister('core')).toThrow(/"shop" depends on it/)
  })
})

describe('state tracking', () => {
  it('starts at "registered"', () => {
    registry.register(makeManifest({ id: 'core' }))
    expect(registry.get('core')?.state).toBe('registered')
  })

  it('setState updates state', () => {
    registry.register(makeManifest({ id: 'core' }))
    registry.setState('core', 'installed')
    expect(registry.get('core')?.state).toBe('installed')
  })

  it('setState("failed", err) records the error', () => {
    registry.register(makeManifest({ id: 'core' }))
    const err = new Error('migration broke')
    registry.setState('core', 'failed', err)
    expect(registry.get('core')?.lastError).toBe(err)
  })

  it('successful transition clears lastError', () => {
    registry.register(makeManifest({ id: 'core' }))
    registry.setState('core', 'failed', new Error('boom'))
    registry.setState('core', 'installed')
    expect(registry.get('core')?.lastError).toBeUndefined()
  })

  it('setState on unknown manifest throws', () => {
    expect(() => registry.setState('ghost', 'active')).toThrow(
      ComponentDependencyError,
    )
  })
})

describe('resolveOrder (topological sort)', () => {
  it('sorts independents in some valid order', () => {
    registry.register(makeManifest({ id: 'a' }))
    registry.register(makeManifest({ id: 'b', prefix: 'b' }))
    const order = registry.resolveOrder()
    expect(order).toHaveLength(2)
    expect(order).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('places dependency before dependent', () => {
    registry.register(makeManifest({ id: 'core' }))
    registry.register(
      makeManifest({
        id: 'shop',
        prefix: 'shop',
        dependencies: [{ id: 'core' }],
      }),
    )
    const order = registry.resolveOrder()
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('shop'))
  })

  it('handles a chain a → b → c (c depends on b, b depends on a)', () => {
    registry.register(makeManifest({ id: 'a' }))
    registry.register(makeManifest({ id: 'b', prefix: 'b', dependencies: [{ id: 'a' }] }))
    registry.register(makeManifest({ id: 'c', prefix: 'c', dependencies: [{ id: 'b' }] }))
    expect(registry.resolveOrder()).toEqual(['a', 'b', 'c'])
  })

  it('handles a diamond (d depends on b and c; b and c depend on a)', () => {
    registry.register(makeManifest({ id: 'a' }))
    registry.register(makeManifest({ id: 'b', prefix: 'b', dependencies: [{ id: 'a' }] }))
    registry.register(makeManifest({ id: 'c', prefix: 'c', dependencies: [{ id: 'a' }] }))
    registry.register(
      makeManifest({
        id: 'd',
        prefix: 'd',
        dependencies: [{ id: 'b' }, { id: 'c' }],
      }),
    )
    const order = registry.resolveOrder()
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('throws on missing dependency', () => {
    registry.register(
      makeManifest({
        id: 'shop',
        dependencies: [{ id: 'core_missing' }],
      }),
    )
    expect(() => registry.resolveOrder()).toThrow(/depends on "core_missing"/)
  })

  it('throws on direct cycle a → b → a', () => {
    registry.register(makeManifest({ id: 'a', dependencies: [{ id: 'b' }] }))
    registry.register(makeManifest({ id: 'b', prefix: 'b', dependencies: [{ id: 'a' }] }))
    expect(() => registry.resolveOrder()).toThrow(/cycle detected/)
  })

  it('throws on indirect cycle a → b → c → a', () => {
    registry.register(makeManifest({ id: 'a', dependencies: [{ id: 'c' }] }))
    registry.register(makeManifest({ id: 'b', prefix: 'b', dependencies: [{ id: 'a' }] }))
    registry.register(makeManifest({ id: 'c', prefix: 'c', dependencies: [{ id: 'b' }] }))
    expect(() => registry.resolveOrder()).toThrow(/cycle detected/)
  })
})

describe('extension validation', () => {
  it('passes when extension targets a declared dep table', () => {
    registry.register(
      makeManifest({
        id: 'core',
        entities: [
          {
            name: 'user',
            tableName: 'users',
            fields: { id: { type: 'uuid', pk: true } },
          },
        ],
      }),
    )
    registry.register(
      makeManifest({
        id: 'shop',
        prefix: 'shop',
        dependencies: [{ id: 'core' }],
        extensions: { core_users: { newsletter: { type: 'boolean' } } },
      }),
    )
    expect(() => registry.validateExtensions()).not.toThrow()
  })

  it('throws when extension targets unknown table', () => {
    registry.register(
      makeManifest({
        id: 'shop',
        extensions: { ghost_table: { x: { type: 'string' } } },
      }),
    )
    expect(() => registry.validateExtensions()).toThrow(
      /extends unknown table "ghost_table"/,
    )
  })

  it('throws when extending an existing table without declaring the dep', () => {
    registry.register(
      makeManifest({
        id: 'core',
        entities: [
          { name: 'user', tableName: 'users', fields: { id: { type: 'uuid', pk: true } } },
        ],
      }),
    )
    registry.register(
      makeManifest({
        id: 'shop',
        prefix: 'shop',
        // dependencies missing
        extensions: { core_users: { x: { type: 'string' } } },
      }),
    )
    expect(() => registry.validateExtensions()).toThrow(
      /does not declare it as a dependency/,
    )
  })

  it('throws when a manifest extends its own table (mistake)', () => {
    registry.register(
      makeManifest({
        id: 'shop',
        entities: [
          { name: 'order', tableName: 'orders', fields: { id: { type: 'uuid', pk: true } } },
        ],
        extensions: { shop_orders: { extra: { type: 'string' } } },
      }),
    )
    expect(() => registry.validateExtensions()).toThrow(
      /cannot extend its own table/,
    )
  })
})

describe('findTableOwner', () => {
  it('returns the manifest that owns a physical table', () => {
    registry.register(
      makeManifest({
        id: 'core',
        entities: [
          { name: 'user', tableName: 'users', fields: { id: { type: 'uuid', pk: true } } },
        ],
      }),
    )
    expect(registry.findTableOwner('core_users')).toBe('core')
  })

  it('returns undefined for unknown tables', () => {
    expect(registry.findTableOwner('ghost')).toBeUndefined()
  })

  it('matches even when the entity tableName already includes the prefix', () => {
    registry.register(
      makeManifest({
        id: 'dc',
        prefix: 'dc',
        entities: [
          {
            name: 'post',
            tableName: 'dc_posts', // already prefixed
            fields: { id: { type: 'uuid', pk: true } },
          },
        ],
      }),
    )
    expect(registry.findTableOwner('dc_posts')).toBe('dc')
  })
})
