/**
 * Manifest validation — pure-function tests.
 *
 * The validator is the gatekeeper for everything else (registry refuses
 * to accept invalid manifests). Tests must cover every error branch so
 * the registry never sees malformed input.
 */

import { describe, expect, it } from 'vitest'
import {
  ComponentValidationError,
  isValidComponentManifestId,
  isValidComponentManifestPrefix,
  isValidSemver,
  validateComponentManifest,
  type ComponentManifest,
} from '../../src/registry'

const baseManifest = (): ComponentManifest => ({
  id: 'core',
  version: '1.0.0',
  prefix: 'core',
})

describe('manifest validation primitives', () => {
  describe('isValidComponentManifestId', () => {
    // Manifest id == npm package name (npm-pure mode). Tests the
    // npm-aligned regex: scoped names allowed, dots/digits allowed
    // (lodash.debounce, 9001 are real npm names), uppercase forbidden,
    // leading _/. forbidden.
    it.each([
      ['core', true],
      ['dynamic_content', true],
      ['my-shop', true],
      ['a', true],
      ['x9z_2-c', true],
      ['9core', true], // npm: digit-first names are valid
      ['core.dot', true], // npm: dots are valid (e.g. lodash.debounce)
      ['@scope/qdcms-plugin-foo', true],
      ['@my-org/qdcms-plugin-shop', true],
      ['@quazardous/qdcms-plugin-core', true],
      ['', false],
      ['Core', false], // uppercase
      ['_core', false], // leading underscore
      ['core space', false],
      ['CORE', false],
      ['@/foo', false], // empty scope
      ['@scope/', false], // empty name
    ])('isValidComponentManifestId(%j) === %s', (input, expected) => {
      expect(isValidComponentManifestId(input)).toBe(expected)
    })
  })

  describe('isValidComponentManifestPrefix', () => {
    it.each([
      ['core', true],
      ['dc', true],
      ['my_shop', true],
      ['x9', true],
      ['', false],
      ['Core', false],
      ['my-shop', false], // dashes are NOT allowed in prefixes (table naming)
      ['9dc', false],
      ['_dc', false],
    ])('isValidComponentManifestPrefix(%j) === %s', (input, expected) => {
      expect(isValidComponentManifestPrefix(input)).toBe(expected)
    })
  })

  describe('isValidSemver', () => {
    it.each([
      ['1.0.0', true],
      ['0.0.1', true],
      ['1.2.3-alpha.1', true],
      ['1.2.3+build.42', true],
      ['1.2.3-alpha.1+build.42', true],
      ['10.20.30', true],
      ['1.0', false],
      ['1', false],
      ['1.0.0.0', false],
      ['v1.0.0', false],
      ['', false],
      ['latest', false],
    ])('isValidSemver(%j) === %s', (input, expected) => {
      expect(isValidSemver(input)).toBe(expected)
    })
  })
})

describe('validateComponentManifest', () => {
  it('accepts a minimal valid manifest', () => {
    expect(() => validateComponentManifest(baseManifest())).not.toThrow()
  })

  it.each([null, undefined, 'string', 42])('rejects non-object manifest %j', (input) => {
    expect(() => validateComponentManifest(input as unknown as ComponentManifest)).toThrow(
      ComponentValidationError,
    )
  })

  it('rejects missing id', () => {
    expect(() =>
      validateComponentManifest({ ...baseManifest(), id: '' as string }),
    ).toThrow(/manifest\.id is required/)
  })

  it('rejects invalid id', () => {
    expect(() =>
      validateComponentManifest({ ...baseManifest(), id: 'BadId' }),
    ).toThrow(/must match/)
  })

  it('rejects missing version', () => {
    expect(() =>
      validateComponentManifest({ ...baseManifest(), version: '' as string }),
    ).toThrow(/manifest\.version is required/)
  })

  it('rejects invalid semver', () => {
    expect(() =>
      validateComponentManifest({ ...baseManifest(), version: '1.0' }),
    ).toThrow(/not valid semver/)
  })

  it('rejects missing prefix', () => {
    expect(() =>
      validateComponentManifest({ ...baseManifest(), prefix: '' as string }),
    ).toThrow(/manifest\.prefix is required/)
  })

  it('rejects prefix with dashes', () => {
    expect(() =>
      validateComponentManifest({ ...baseManifest(), prefix: 'my-shop' }),
    ).toThrow(/must match/)
  })

  it('rejects non-array dependencies', () => {
    expect(() =>
      validateComponentManifest({
        ...baseManifest(),
        dependencies: 'core' as unknown as ComponentManifest['dependencies'],
      }),
    ).toThrow(/must be an array/)
  })

  it('rejects dependency with invalid id', () => {
    expect(() =>
      validateComponentManifest({
        ...baseManifest(),
        dependencies: [{ id: 'Bad ID' }],
      }),
    ).toThrow(/invalid id/)
  })

  it('accepts well-formed extensions', () => {
    expect(() =>
      validateComponentManifest({
        ...baseManifest(),
        extensions: {
          core_users: { newsletter_opt_in: { type: 'boolean' } },
        },
      }),
    ).not.toThrow()
  })

  it('rejects extensions that is not an object', () => {
    expect(() =>
      validateComponentManifest({
        ...baseManifest(),
        extensions: [] as unknown as ComponentManifest['extensions'],
      }),
    ).toThrow(/keyed by table name/)
  })

  it('attaches the componentId to the error', () => {
    try {
      validateComponentManifest({ ...baseManifest(), id: 'core', version: 'invalid' })
    } catch (e) {
      expect(e).toBeInstanceOf(ComponentValidationError)
      expect((e as ComponentValidationError).componentId).toBe('core')
      return
    }
    expect.fail('should have thrown')
  })
})
