/**
 * Semver range support in plugin dependencies.
 *
 * Two layers covered:
 * - Validation at register time: invalid ranges rejected, valid ranges
 *   accepted (delegated to npm `semver` package's `validRange`)
 * - Satisfaction at resolveOrder: `semver.satisfies(installedVersion,
 *   range)` enforced; mismatch throws PluginDependencyError with a
 *   message that names both the requirement and the installed version
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  InMemoryPluginRegistry,
  isValidSemverRange,
  PluginDependencyError,
  PluginValidationError,
  type Plugin,
  type PluginManifest,
} from '../../src/plugin'

function makePlugin(manifest: Partial<PluginManifest> & { id: string }): Plugin {
  return {
    manifest: {
      version: '1.0.0',
      prefix: manifest.id,
      ...manifest,
    } as PluginManifest,
  }
}

describe('isValidSemverRange', () => {
  it.each([
    // accepted ranges
    ['', true],            // empty == any
    ['*', true],
    ['1.0.0', true],       // exact version is also a valid range
    ['^1.0.0', true],
    ['^1.0.0-alpha.1', true],
    ['~2.3.0', true],
    ['~2.3', true],
    ['>=1.0.0', true],
    ['>=1.0.0 <2.0.0', true],
    ['1.x', true],
    ['1.2.x', true],
    ['1.0.0 || 2.0.0', true],
    ['>=1.0.0 <2.0.0 || >=3.0.0', true],
    // rejected garbage
    ['wat', false],
    ['1.0..0', false],
    ['^abc', false],
    ['~~1.0.0', false],
    ['>1.0.0 < 2.0.0!', false],
  ])('isValidSemverRange(%j) === %s', (input, expected) => {
    expect(isValidSemverRange(input)).toBe(expected)
  })
})

describe('manifest validation — dependency version ranges', () => {
  let registry: InMemoryPluginRegistry

  beforeEach(() => {
    registry = new InMemoryPluginRegistry()
  })

  it('accepts a manifest with valid range', () => {
    expect(() =>
      registry.register(
        makePlugin({
          id: 'shop',
          dependencies: [{ id: 'core', version: '^1.0.0' }],
        }),
      ),
    ).not.toThrow()
  })

  it('accepts a manifest with omitted version on a dep', () => {
    expect(() =>
      registry.register(
        makePlugin({
          id: 'shop',
          dependencies: [{ id: 'core' }],
        }),
      ),
    ).not.toThrow()
  })

  it('accepts a manifest with explicit "*" range', () => {
    expect(() =>
      registry.register(
        makePlugin({
          id: 'shop',
          dependencies: [{ id: 'core', version: '*' }],
        }),
      ),
    ).not.toThrow()
  })

  it('rejects a manifest with garbage range', () => {
    expect(() =>
      registry.register(
        makePlugin({
          id: 'shop',
          dependencies: [{ id: 'core', version: 'wat' }],
        }),
      ),
    ).toThrow(PluginValidationError)
  })

  it('rejects a manifest with broken syntax range', () => {
    expect(() =>
      registry.register(
        makePlugin({
          id: 'shop',
          dependencies: [{ id: 'core', version: '^abc' }],
        }),
      ),
    ).toThrow(/invalid version range "\^abc"/)
  })
})

describe('resolveOrder — version satisfaction', () => {
  let registry: InMemoryPluginRegistry

  beforeEach(() => {
    registry = new InMemoryPluginRegistry()
  })

  it('passes when installed version satisfies the range', () => {
    registry.register(makePlugin({ id: 'core', version: '1.5.0' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '^1.0.0' }],
      }),
    )
    expect(() => registry.resolveOrder()).not.toThrow()
  })

  it('passes with explicit range "*"', () => {
    registry.register(makePlugin({ id: 'core', version: '0.0.1' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '*' }],
      }),
    )
    expect(() => registry.resolveOrder()).not.toThrow()
  })

  it('passes with omitted version (treated as any)', () => {
    registry.register(makePlugin({ id: 'core', version: '0.0.1' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core' }],
      }),
    )
    expect(() => registry.resolveOrder()).not.toThrow()
  })

  it('throws when installed version does NOT satisfy the range', () => {
    registry.register(makePlugin({ id: 'core', version: '0.5.0' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '^1.0.0' }],
      }),
    )
    expect(() => registry.resolveOrder()).toThrow(PluginDependencyError)
  })

  it('error message names both the requirement and the installed version', () => {
    registry.register(makePlugin({ id: 'core', version: '0.5.0' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '^1.0.0' }],
      }),
    )
    expect(() => registry.resolveOrder()).toThrow(/requires "core" \^1\.0\.0 but 0\.5\.0 is registered/)
  })

  it('handles tilde range correctly (~2.3.0 accepts 2.3.4 but not 2.4.0)', () => {
    registry.register(makePlugin({ id: 'core', version: '2.3.4' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '~2.3.0' }],
      }),
    )
    expect(() => registry.resolveOrder()).not.toThrow()

    // Reset, install incompatible version
    const r2 = new InMemoryPluginRegistry()
    r2.register(makePlugin({ id: 'core', version: '2.4.0' }))
    r2.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '~2.3.0' }],
      }),
    )
    expect(() => r2.resolveOrder()).toThrow(/requires "core" ~2\.3\.0 but 2\.4\.0/)
  })

  it('handles compound range (>=1.0.0 <2.0.0)', () => {
    registry.register(makePlugin({ id: 'core', version: '1.5.0' }))
    registry.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '>=1.0.0 <2.0.0' }],
      }),
    )
    expect(() => registry.resolveOrder()).not.toThrow()

    const r2 = new InMemoryPluginRegistry()
    r2.register(makePlugin({ id: 'core', version: '2.0.0' }))
    r2.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '>=1.0.0 <2.0.0' }],
      }),
    )
    expect(() => r2.resolveOrder()).toThrow(/but 2\.0\.0/)
  })

  it('handles OR range (1.0.0 || 2.0.0)', () => {
    const r1 = new InMemoryPluginRegistry()
    r1.register(makePlugin({ id: 'core', version: '1.0.0' }))
    r1.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '1.0.0 || 2.0.0' }],
      }),
    )
    expect(() => r1.resolveOrder()).not.toThrow()

    const r2 = new InMemoryPluginRegistry()
    r2.register(makePlugin({ id: 'core', version: '2.0.0' }))
    r2.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '1.0.0 || 2.0.0' }],
      }),
    )
    expect(() => r2.resolveOrder()).not.toThrow()

    const r3 = new InMemoryPluginRegistry()
    r3.register(makePlugin({ id: 'core', version: '1.5.0' }))
    r3.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '1.0.0 || 2.0.0' }],
      }),
    )
    expect(() => r3.resolveOrder()).toThrow(/but 1\.5\.0/)
  })

  it('pre-release versions: 1.0.0-alpha satisfies ^1.0.0-alpha but not ^1.0.0', () => {
    const r1 = new InMemoryPluginRegistry()
    r1.register(makePlugin({ id: 'core', version: '1.0.0-alpha.1' }))
    r1.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '^1.0.0-alpha' }],
      }),
    )
    expect(() => r1.resolveOrder()).not.toThrow()

    const r2 = new InMemoryPluginRegistry()
    r2.register(makePlugin({ id: 'core', version: '1.0.0-alpha.1' }))
    r2.register(
      makePlugin({
        id: 'shop',
        dependencies: [{ id: 'core', version: '^1.0.0' }],
      }),
    )
    expect(() => r2.resolveOrder()).toThrow()
  })

  it('multi-dep: all must satisfy', () => {
    registry.register(makePlugin({ id: 'core', version: '1.0.0' }))
    registry.register(makePlugin({ id: 'i18n', version: '2.0.0', prefix: 'i18n' }))
    registry.register(
      makePlugin({
        id: 'shop',
        prefix: 'shop',
        dependencies: [
          { id: 'core', version: '^1.0.0' },
          { id: 'i18n', version: '^3.0.0' }, // not satisfied by 2.0.0
        ],
      }),
    )
    expect(() => registry.resolveOrder()).toThrow(/requires "i18n" \^3\.0\.0 but 2\.0\.0/)
  })
})
