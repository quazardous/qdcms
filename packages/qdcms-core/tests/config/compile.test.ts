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
  it('compiles a concept-named framework file', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'qdcms.locales.yaml'),
        `- en\n- fr\n`,
      )
      const result = await compileConfig({ instanceDir: dir })

      expect(result.namespaces.qdcms?.locales).toEqual(['en', 'fr'])
      const compiled = readFileSync(
        join(dir, '.compiled', 'qdcms.locales.ts'),
        'utf8',
      )
      expect(compiled).toContain('"en"')
      expect(compiled).toContain('"fr"')
      expect(compiled).toContain('export default value')

      const indexTs = readFileSync(
        join(dir, '.compiled', 'index.ts'),
        'utf8',
      )
      expect(indexTs).toContain(
        `export { default as qdcmsLocales } from './qdcms.locales'`,
      )
    } finally {
      cleanup()
    }
  })

  it('compiles a self-keyed framework file', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'qdcms.yaml'),
        `locales: [en, fr]\nplugins:\n  - id: core\n`,
      )
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces.qdcms?.locales).toEqual(['en', 'fr'])
      expect(result.namespaces.qdcms?.plugins).toEqual([{ id: 'core' }])
    } finally {
      cleanup()
    }
  })

  it('compiles a plugin file with concept-named shape', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'plugin-dc.types.yaml'),
        `- id: post\n  pluralName: Posts\n- id: page\n  pluralName: Pages\n`,
      )
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces['plugin-dc']?.types).toEqual([
        { id: 'post', pluralName: 'Posts' },
        { id: 'page', pluralName: 'Pages' },
      ])
    } finally {
      cleanup()
    }
  })

  it('compiles a plugin file with self-keyed shape', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'plugin-dc.yaml'),
        `types:\n  - id: post\nfields:\n  rich-text: editor\n`,
      )
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces['plugin-dc']?.types).toEqual([{ id: 'post' }])
      expect(result.namespaces['plugin-dc']?.fields).toEqual({
        'rich-text': 'editor',
      })
    } finally {
      cleanup()
    }
  })

  it('mixes concept-named and self-keyed across separate concepts', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'plugin-dc.types.yaml'),
        `- id: post\n`,
      )
      writeFileSync(
        join(dir, 'plugin-dc.yaml'),
        `fields:\n  rich-text: editor\n`,
      )
      const result = await compileConfig({ instanceDir: dir })
      expect(result.namespaces['plugin-dc']?.types).toEqual([{ id: 'post' }])
      expect(result.namespaces['plugin-dc']?.fields).toEqual({
        'rich-text': 'editor',
      })
    } finally {
      cleanup()
    }
  })

  it('errors on a duplicate concept across files', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'plugin-dc.types.yaml'),
        `- id: post\n`,
      )
      writeFileSync(
        join(dir, 'plugin-dc.yaml'),
        `types:\n  - id: page\n`,
      )
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
      writeFileSync(join(dir, 'plugin-dc.yaml'), `- one\n- two\n`)
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
      writeFileSync(join(dir, 'qdcms.locales.yaml'), `- en\n`)
      writeFileSync(join(dir, 'plugin-dc.types.yaml'), `- id: post\n`)
      const result = await compileConfig({ instanceDir: dir })
      const indexTs = readFileSync(
        join(dir, '.compiled', 'index.ts'),
        'utf8',
      )
      expect(indexTs).toContain(
        `export { default as qdcmsLocales } from './qdcms.locales'`,
      )
      expect(indexTs).toContain(
        `export { default as pluginDcTypes } from './plugin-dc.types'`,
      )
      expect(result.outputs.length).toBe(3) // 2 modules + index
    } finally {
      cleanup()
    }
  })
})
