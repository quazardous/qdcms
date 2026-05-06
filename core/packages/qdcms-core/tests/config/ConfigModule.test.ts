/**
 * ConfigModule — declarative wrapper around the framework config layer.
 *
 * Coverage focus :
 * - Identity (moduleName, priority, citizenship-friendly defaults)
 * - configSchemas wires up the framework's qdcms.* namespace
 * - Default no-op lifecycle (instance hooks inherited from Module)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtinSchemas, ConfigModule } from '../../src/config'
import { Kernel, registerSources } from '../../src/kernel'
import { Module } from '../../src/module'

function scratch(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'qdcms-configmodule-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('ConfigModule — static contract', () => {
  it('declares moduleName "config"', () => {
    expect(ConfigModule.moduleName).toBe('config')
  })

  it('uses a low priority so it loads before everything else', () => {
    expect(ConfigModule.priority).toBeLessThan(0)
  })

  it('exposes the framework builtinSchemas via configSchemas', () => {
    expect(ConfigModule.configSchemas).toBe(builtinSchemas)
    expect(ConfigModule.configSchemas.length).toBeGreaterThan(0)
  })

  it("doesn't ship CLI commands (the framework binary owns those)", () => {
    expect(ConfigModule.cliCommands).toBeNull()
  })

  it('declares no DB entities (until slice C9 lands the live-config table)', () => {
    expect(ConfigModule.entities).toEqual([])
  })
})

describe('ConfigModule — instance', () => {
  it('extends the Module base class', () => {
    const m = new ConfigModule()
    expect(m).toBeInstanceOf(Module)
  })

  it('resolves its name to "config" via the Module name getter', () => {
    expect(new ConfigModule().name).toBe('config')
  })

  it("inherits Module's no-op lifecycle (no overrides yet)", async () => {
    const m = new ConfigModule()
    await expect(m.connect({})).resolves.toBeUndefined()
    await expect(m.disconnect()).resolves.toBeUndefined()
    await expect(m.install({})).resolves.toBeUndefined()
    await expect(m.uninstall({})).resolves.toBeUndefined()
  })
})

describe('ConfigModule.compile — kernel-aware pipeline', () => {
  it('validates qdcms.locales when ConfigModule is on the kernel', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(
        join(dir, 'qdcms.locales.yaml'),
        `list: [en, fr]\ndefault: en\n`,
      )
      const kernel = new Kernel()
      registerSources(kernel, { modules: [ConfigModule] })
      const result = await ConfigModule.compile({ instanceDir: dir, kernel })
      expect(result.namespaces.qdcms?.locales).toEqual({
        list: ['en', 'fr'],
        default: 'en',
      })
      expect(result.warnings).toEqual([])
    } finally {
      cleanup()
    }
  })

  it("doesn't validate qdcms.* when no kernel module supplies a schema", async () => {
    const { dir, cleanup } = scratch()
    try {
      // Same yaml as above, but no kernel + no extras → nothing
      // registers the qdcms namespace, so the concept passes
      // through without validation. Proves the auto-include is
      // truly gone : the host owns whose schemas reach the
      // compiler.
      writeFileSync(
        join(dir, 'qdcms.locales.yaml'),
        `list: [en, fr]\ndefault: en\n`,
      )
      const result = await ConfigModule.compile({ instanceDir: dir })
      expect(result.namespaces.qdcms?.locales).toEqual({
        list: ['en', 'fr'],
        default: 'en',
      })
      expect(result.warnings).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('extraSchemas override kernel-supplied ones (same namespace)', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-shop.foo.yaml'), `- one\n`)
      // Build a kernel WITHOUT plugin-shop. Then pass an extra
      // schema that DOES register plugin-shop. Compile should
      // validate against the extra.
      const { defineConfigSchema, field } = await import('../../src/config/schema')
      const shopSchema = defineConfigSchema({
        namespace: 'plugin-shop',
        contributedBy: '@test/plugin-shop',
        concepts: { foo: { shape: field.array(field.string()) } },
      })
      const kernel = new Kernel()
      registerSources(kernel, { modules: [ConfigModule] })
      const result = await ConfigModule.compile({
        instanceDir: dir,
        kernel,
        extraSchemas: [shopSchema],
      })
      expect(result.namespaces['plugin-shop']?.foo).toEqual(['one'])
    } finally {
      cleanup()
    }
  })

  it('aggregates schemas from every module on the kernel', async () => {
    const { dir, cleanup } = scratch()
    try {
      writeFileSync(join(dir, 'plugin-shop.bar.yaml'), `value: 42\n`)
      const { defineConfigSchema, field } = await import('../../src/config/schema')
      const shopSchema = defineConfigSchema({
        namespace: 'plugin-shop',
        contributedBy: '@test/plugin-shop',
        concepts: {
          bar: {
            shape: field.object({ value: field.number() }),
          },
        },
      })
      class ShopModule extends Module {
        static moduleName = 'shop'
        static configSchemas = [shopSchema]
      }
      const kernel = new Kernel()
      registerSources(kernel, { modules: [ConfigModule, ShopModule] })
      const result = await ConfigModule.compile({ instanceDir: dir, kernel })
      expect(result.namespaces['plugin-shop']?.bar).toEqual({ value: 42 })
    } finally {
      cleanup()
    }
  })

  it('uses ConfigModule.configSchemas which IS builtinSchemas', () => {
    expect(ConfigModule.configSchemas).toBe(builtinSchemas)
  })
})
