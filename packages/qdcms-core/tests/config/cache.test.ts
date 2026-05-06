import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync, utimesSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileConfig } from '../../src/config'

function scratch(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'qdcms-cache-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('compileConfig cache', () => {
  it('emits cache file on first compile', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n- two\n`)
      const r1 = await compileConfig({ instanceDir: dir })
      expect(r1.cache.hit).toBe(false)

      const cachePath = join(dir, '.compiled', '.cache.json')
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
      expect(cache.version).toBe(1)
      expect(cache.concepts['plugin-test.foo']).toBeDefined()
      expect(cache.concepts['plugin-test.foo'].hash).toMatch(/^[0-9a-f]{64}$/)
      expect(cache.values['plugin-test.foo']).toEqual(['one', 'two'])
    } finally {
      cleanup()
    }
  })

  it('returns cache hit when nothing changed', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      await compileConfig({ instanceDir: dir })
      // Second compile within the same mtime resolution should hit
      // the fast path. Force the cache stamp into the future to
      // remove flakiness across filesystems with low-precision
      // mtimes.
      const cachePath = join(dir, '.compiled', '.cache.json')
      const future = new Date(Date.now() + 5_000)
      utimesSync(cachePath, future, future)

      const r2 = await compileConfig({ instanceDir: dir })
      expect(r2.cache.hit).toBe(true)
      expect(r2.namespaces['plugin-test']?.foo).toEqual(['one'])
    } finally {
      cleanup()
    }
  })

  it('recompiles when an input YAML changes', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      await compileConfig({ instanceDir: dir })

      // Edit the YAML, push its mtime forward so the pre-check fails.
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n- two\n`)
      const future = new Date(Date.now() + 5_000)
      utimesSync(join(dir, 'plugin-test.foo.yaml'), future, future)

      const r2 = await compileConfig({ instanceDir: dir })
      expect(r2.cache.hit).toBe(false)
      expect(r2.namespaces['plugin-test']?.foo).toEqual(['one', 'two'])
    } finally {
      cleanup()
    }
  })

  it('skips per-concept emit when hash matches (medium path)', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      writeFileSync(join(dir, 'plugin-test.bar.yaml'), `value: 1\n`)
      await compileConfig({ instanceDir: dir })

      // Touch ONE input forward so the fast-path fails but only
      // foo's hash should mismatch (we don't actually edit it,
      // just bump mtime — sha256 is identical).
      const fooPath = join(dir, 'plugin-test.foo.yaml')
      const future = new Date(Date.now() + 5_000)
      utimesSync(fooPath, future, future)

      const r2 = await compileConfig({ instanceDir: dir })
      // Fast path missed (mtime advanced) but per-concept hash
      // matches for both, so both concepts skip emit.
      expect(r2.cache.hit).toBe(false)
      expect(r2.cache.skippedConcepts).toBe(2)
    } finally {
      cleanup()
    }
  })

  it('honours noCache: forces a full recompile', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      await compileConfig({ instanceDir: dir })

      const cachePath = join(dir, '.compiled', '.cache.json')
      const future = new Date(Date.now() + 5_000)
      utimesSync(cachePath, future, future)

      const r2 = await compileConfig({ instanceDir: dir, noCache: true })
      expect(r2.cache.hit).toBe(false)
      expect(r2.cache.skippedConcepts).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('discards cache when version mismatches', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-test.foo.yaml'), `- one\n`)
      await compileConfig({ instanceDir: dir })

      // Corrupt the cache: bump version to a future schema.
      const cachePath = join(dir, '.compiled', '.cache.json')
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
      cache.version = 999
      writeFileSync(cachePath, JSON.stringify(cache))

      const r2 = await compileConfig({ instanceDir: dir })
      // Old cache discarded → cold path, no skips.
      expect(r2.cache.hit).toBe(false)
      expect(r2.cache.skippedConcepts).toBe(0)
    } finally {
      cleanup()
    }
  })
})
