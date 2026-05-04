/**
 * packageJsonAdapter — pure-function tests.
 *
 * Coverage focus:
 * - Happy path: name+version+yaml fields → unified manifest
 * - peerDependencies filtered by plugin convention
 * - regular dependencies still picked up if matching predicate
 * - custom predicate
 * - forbidden yaml fields rejected
 * - missing required package.json fields rejected
 * - validation runs by default; can be disabled
 */

import { describe, expect, it } from 'vitest'
import {
  buildManifestFromPackageJson,
  defaultIsPluginDependency,
} from '../../src/loader'
import { PluginValidationError } from '../../src/plugin'

const validYaml = `
prefix: shop
title: Shop
entities:
  orders:
    fields:
      id: { type: uuid, pk: true }
`

describe('defaultIsPluginDependency', () => {
  it.each([
    ['@scope/qdcms-plugin-foo', true],
    ['qdcms-plugin-bar', true],
    ['@quazardous/qdcms-plugin-core', true],
    ['react', false],
    ['vue', false],
    ['@quazardous/qdcore', false],
    ['unrelated-package', false],
  ])('defaultIsPluginDependency(%j) === %s', (name, expected) => {
    expect(defaultIsPluginDependency(name)).toBe(expected)
  })
})

describe('buildManifestFromPackageJson — happy path', () => {
  it('builds a minimal valid manifest', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-shop',
        version: '1.0.0',
        keywords: ['qdcms-plugin'],
      },
      qdcmsYaml: validYaml,
    })
    expect(manifest.id).toBe('@my-org/qdcms-plugin-shop')
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.prefix).toBe('shop')
    expect(manifest.title).toBe('Shop')
    expect(manifest.entities).toBeDefined()
    expect(manifest.entities?.orders).toBeDefined()
  })

  it('extracts dependencies from peerDependencies', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-shop',
        version: '1.0.0',
        peerDependencies: {
          '@my-org/qdcms-plugin-core': '^1.0.0',
          react: '^18.0.0', // NOT a qdcms plugin → filtered out
        },
      },
      qdcmsYaml: validYaml,
    })
    expect(manifest.dependencies).toEqual([
      { id: '@my-org/qdcms-plugin-core', version: '^1.0.0' },
    ])
  })

  it('also picks up plugin deps from regular dependencies', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-shop',
        version: '1.0.0',
        dependencies: {
          '@my-org/qdcms-plugin-core': '^1.0.0',
          lodash: '^4.0.0',
        },
      },
      qdcmsYaml: validYaml,
    })
    expect(manifest.dependencies).toEqual([
      { id: '@my-org/qdcms-plugin-core', version: '^1.0.0' },
    ])
  })

  it('peerDependencies override regular dependencies for the same plugin', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-shop',
        version: '1.0.0',
        dependencies: { '@my-org/qdcms-plugin-core': '^1.0.0' },
        peerDependencies: { '@my-org/qdcms-plugin-core': '^2.0.0' },
      },
      qdcmsYaml: validYaml,
    })
    expect(manifest.dependencies).toEqual([
      { id: '@my-org/qdcms-plugin-core', version: '^2.0.0' },
    ])
  })

  it('omits the dependencies array when empty', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-foo',
        version: '1.0.0',
      },
      qdcmsYaml: validYaml,
    })
    expect(manifest.dependencies).toBeUndefined()
  })

  it('honours a custom isPluginDependency predicate', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-shop',
        version: '1.0.0',
        peerDependencies: { 'my-custom-thing': '^1.0.0' },
      },
      qdcmsYaml: validYaml,
      isPluginDependency: (name) => name === 'my-custom-thing',
    })
    expect(manifest.dependencies).toEqual([
      { id: 'my-custom-thing', version: '^1.0.0' },
    ])
  })

  it('extracts schemaManaged from yaml when present', () => {
    const manifest = buildManifestFromPackageJson({
      packageJson: { name: '@my-org/qdcms-plugin-foo', version: '1.0.0' },
      qdcmsYaml: 'prefix: foo\nschemaManaged: false\n',
    })
    expect(manifest.schemaManaged).toBe(false)
  })

  it('extracts extensions from yaml when present', () => {
    // Need core entity declared in another plugin to make this validate;
    // disable validation since we don't actually have core here.
    const manifest = buildManifestFromPackageJson({
      packageJson: {
        name: '@my-org/qdcms-plugin-shop',
        version: '1.0.0',
        peerDependencies: { '@my-org/qdcms-plugin-core': '^1.0.0' },
      },
      qdcmsYaml: `prefix: shop
extensions:
  core_users:
    bio: { type: text, nullable: true }
`,
      validate: false,
    })
    expect(manifest.extensions).toBeDefined()
    expect(manifest.extensions?.core_users).toBeDefined()
  })
})

describe('buildManifestFromPackageJson — error paths', () => {
  it('rejects missing package.json', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: null as unknown as never,
        qdcmsYaml: validYaml,
      }),
    ).toThrow(PluginValidationError)
  })

  it('rejects missing name', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '', version: '1.0.0' },
        qdcmsYaml: validYaml,
      }),
    ).toThrow(/package\.json\.name is required/)
  })

  it('rejects missing version', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '@x/qdcms-plugin-foo', version: '' },
        qdcmsYaml: validYaml,
      }),
    ).toThrow(/package\.json\.version is required/)
  })

  it('rejects malformed yaml', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '@x/qdcms-plugin-foo', version: '1.0.0' },
        qdcmsYaml: 'prefix: [\n bad: yaml',
      }),
    ).toThrow(/failed to parse/)
  })

  it('rejects yaml top-level that is not a mapping', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '@x/qdcms-plugin-foo', version: '1.0.0' },
        qdcmsYaml: '- foo\n- bar\n',
      }),
    ).toThrow(/top-level must be a YAML mapping/)
  })

  it('rejects yaml with forbidden id field', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '@x/qdcms-plugin-foo', version: '1.0.0' },
        qdcmsYaml: 'id: should-not-be-here\nprefix: foo\n',
      }),
    ).toThrow(/"id" must not be set in the YAML/)
  })

  it('rejects yaml with forbidden version field', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '@x/qdcms-plugin-foo', version: '1.0.0' },
        qdcmsYaml: 'version: 1.0.0\nprefix: foo\n',
      }),
    ).toThrow(/"version" must not be set in the YAML/)
  })

  it('rejects yaml with forbidden dependencies field', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: '@x/qdcms-plugin-foo', version: '1.0.0' },
        qdcmsYaml: 'dependencies: []\nprefix: foo\n',
      }),
    ).toThrow(/"dependencies" must not be set in the YAML/)
  })

  it('runs validateManifest by default and surfaces failures', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: 'BadName', version: '1.0.0' },
        qdcmsYaml: validYaml,
      }),
    ).toThrow(PluginValidationError)
  })

  it('skips validation when validate: false', () => {
    expect(() =>
      buildManifestFromPackageJson({
        packageJson: { name: 'BadName', version: '1.0.0' },
        qdcmsYaml: validYaml,
        validate: false,
      }),
    ).not.toThrow()
  })
})
