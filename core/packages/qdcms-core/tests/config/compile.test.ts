import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileConfig } from '../../src/config'

function scratch(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'qdcms-config-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('compileConfig', () => {
  it('compiles a concept-named plugin file (no schema, passthrough)', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n- two\n`)
      const result = await compileConfig({ instanceDir: dir })

      expect(result.namespaces['plugin-test']?.foo).toEqual(['one', 'two'])
      const compiled = readFileSync(
        join(dir, '.compiled', 'plugin-test.foo.ts'),
        'utf8',
      )
      expect(compiled).toContain('"one"')
      expect(compiled).toContain('export default value')

      const indexTs = readFileSync(
        join(dir, '.compiled', 'index.ts'),
        'utf8',
      )
      expect(indexTs).toContain(
        `export { default as pluginTestFoo } from './plugin-test.foo'`,
      )
    } finally {
      cleanup()
    }
  })

  it('compiles a self-keyed plugin file', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'plugin-test.yaml'),
        `foo: [one, two]\nbar:\n  baz: qux\n`,
      )
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces['plugin-test']?.foo).toEqual(['one', 'two'])
      expect(result.namespaces['plugin-test']?.bar).toEqual({ baz: 'qux' })
    } finally {
      cleanup()
    }
  })

  it('mixes concept-named and self-keyed across separate concepts', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      writeFileSync(join(dir, 'plugin-test.yaml'), `bar:\n  baz: qux\n`)
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces['plugin-test']?.foo).toEqual(['one'])
      expect(result.namespaces['plugin-test']?.bar).toEqual({ baz: 'qux' })
    } finally {
      cleanup()
    }
  })

  it('errors on a duplicate concept across files', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      writeFileSync(join(dir, 'plugin-test.yaml'), `foo:\n  - two\n`)
      await expect(compileConfig({ instanceDir: dir })).rejects.toThrow(
        /declared in multiple files/,
      )
    } finally {
      cleanup()
    }
  })

  it('rejects an unrecognised file prefix', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'random.yaml'), `foo: bar\n`)
      await expect(compileConfig({ instanceDir: dir })).rejects.toThrow(
        /not in a recognised namespace/,
      )
    } finally {
      cleanup()
    }
  })

  it('rejects a self-keyed file whose body is not an object', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.yaml'), `- one\n- two\n`)
      await expect(compileConfig({ instanceDir: dir })).rejects.toThrow(
        /must contain an object/,
      )
    } finally {
      cleanup()
    }
  })

  it('emits a stable index aggregator across multiple namespaces', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      writeFileSync(join(dir, 'plugin-other.bar.yaml'), `- two\n`)
      const result = await compileConfig({ instanceDir: dir })
      const indexTs = readFileSync(
        join(dir, '.compiled', 'index.ts'),
        'utf8',
      )
      expect(indexTs).toContain(
        `export { default as pluginTestFoo } from './plugin-test.foo'`,
      )
      expect(indexTs).toContain(
        `export { default as pluginOtherBar } from './plugin-other.bar'`,
      )
      expect(result.outputs.length).toBe(3) // 2 modules + index
    } finally {
      cleanup()
    }
  })

  it('validates qdcms.locales against the built-in schema', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'qdcms.locales.yaml'),
        `list: [en, fr]\ndefault: en\n`,
      )
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces.qdcms?.locales).toEqual({
        list: ['en', 'fr'],
        default: 'en',
      })
      expect(result.warnings).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('rejects qdcms.locales with bad shape', async () => {
    const { dir, cleanup } = scratch()
    try {
      // missing `default`, list contains a number — both should
      // surface as schema violations.
      writeFileSync(
        join(dir, 'qdcms.locales.yaml'),
        `list: [en, 42]\n`,
      )
      await expect(compileConfig({ instanceDir: dir })).rejects.toThrow(
        /schema validation failed for 'qdcms\.locales'/,
      )
    } finally {
      cleanup()
    }
  })

  it('validates qdcms.plugins against the built-in schema', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'qdcms.plugins.yaml'),
        [
          `- id: '@quazardous/qdcms-plugin-core'`,
          `  version: 0.1.0`,
          `  prefix: core`,
          `  title: Core`,
          `  tables:`,
          `    - user`,
          `    - session`,
          ``,
        ].join('\n'),
      )
      const result = await compileConfig({ instanceDir: dir })
      const plugins = result.namespaces.qdcms?.plugins as unknown[]
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins).toHaveLength(1)
    } finally {
      cleanup()
    }
  })

  it('rejects an unknown concept under a known namespace', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'qdcms.unknown.yaml'),
        `foo: bar\n`,
      )
      await expect(compileConfig({ instanceDir: dir })).rejects.toThrow(
        /unknown concept 'qdcms\.unknown'/,
      )
    } finally {
      cleanup()
    }
  })

  it('emits a deprecation warning when a custom schema flags a concept', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-old.foo.yaml'), `- one\n- two\n`)
      const { defineConfigSchema, field } = await import('../../src/config/schema')
      const schema = defineConfigSchema({
        namespace: 'plugin-old',
        contributedBy: '@test/plugin-old',
        concepts: {
          foo: {
            deprecated: { since: '0.4.0', replacement: 'plugin-new.bar' },
            shape: field.array(field.string()),
          },
        },
      })

      const result = await compileConfig({
        instanceDir: dir,
        schemas: [schema],
      })
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]?.kind).toBe('deprecated')
      expect(result.warnings[0]?.message).toContain('plugin-old.foo')
      expect(result.warnings[0]?.message).toContain('0.4.0')
      expect(result.warnings[0]?.message).toContain('plugin-new.bar')
    } finally {
      cleanup()
    }
  })
})
