import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverPluginRoots, findQdcmsCore } from '../src/discover-plugins'

function scratchCore(): { core: string; nm: string; cleanup: () => void } {
  const core = mkdtempSync(join(tmpdir(), 'qdcms-discover-test-'))
  const nm = join(core, 'node_modules')
  mkdirSync(nm)
  return { core, nm, cleanup: () => rmSync(core, { recursive: true, force: true }) }
}

function makePkg(
  root: string,
  name: string,
  pkg: Record<string, unknown>,
): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...pkg }))
  return dir
}

describe('discoverPluginRoots', () => {
  it('finds an unscoped plugin with both keyword and oclif.commands', () => {
    const { core, nm, cleanup } = scratchCore()
    try {
      const pluginDir = makePkg(nm, 'qdcms-plugin-foo', {
        version: '0.0.1',
        keywords: ['qdcms-plugin'],
        oclif: { commands: './src/commands' },
      })
      expect(discoverPluginRoots(core)).toEqual([pluginDir])
    } finally {
      cleanup()
    }
  })

  it('finds a scoped plugin', () => {
    const { core, nm, cleanup } = scratchCore()
    try {
      const scope = join(nm, '@quazardous')
      mkdirSync(scope, { recursive: true })
      const pluginDir = makePkg(scope, 'qdcms-plugin-dc', {
        version: '0.0.1',
        keywords: ['qdcms-plugin'],
        oclif: { commands: './src/commands' },
      })
      expect(discoverPluginRoots(core)).toEqual([pluginDir])
    } finally {
      cleanup()
    }
  })

  it('skips packages missing the qdcms-plugin keyword', () => {
    const { core, nm, cleanup } = scratchCore()
    try {
      makePkg(nm, 'lodash', {
        version: '0.0.1',
        oclif: { commands: './src/commands' },
      })
      expect(discoverPluginRoots(core)).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('skips qdcms plugins WITHOUT oclif.commands', () => {
    const { core, nm, cleanup } = scratchCore()
    try {
      makePkg(nm, 'qdcms-plugin-headless', {
        version: '0.0.1',
        keywords: ['qdcms-plugin'],
      })
      expect(discoverPluginRoots(core)).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('skips dotfiles and broken package.json gracefully', () => {
    const { core, nm, cleanup } = scratchCore()
    try {
      mkdirSync(join(nm, '.cache'))
      mkdirSync(join(nm, 'broken'))
      writeFileSync(join(nm, 'broken', 'package.json'), '{ this is invalid json')
      expect(discoverPluginRoots(core)).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('returns [] when node_modules does not exist', () => {
    const { core, cleanup } = scratchCore()
    try {
      rmSync(join(core, 'node_modules'), { recursive: true })
      expect(discoverPluginRoots(core)).toEqual([])
    } finally {
      cleanup()
    }
  })
})

describe('findQdcmsCore', () => {
  it('honours the QDCMS_CORE env var when set', () => {
    const before = process.env.QDCMS_CORE
    try {
      process.env.QDCMS_CORE = '/some/abs/path'
      expect(findQdcmsCore()).toBe('/some/abs/path')
    } finally {
      if (before === undefined) delete process.env.QDCMS_CORE
      else process.env.QDCMS_CORE = before
    }
  })
})
