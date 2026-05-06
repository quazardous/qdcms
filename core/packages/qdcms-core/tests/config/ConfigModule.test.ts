/**
 * ConfigModule — declarative wrapper around the framework config layer.
 *
 * Coverage focus :
 * - Identity (moduleName, priority, citizenship-friendly defaults)
 * - configSchemas wires up the framework's qdcms.* namespace
 * - Default no-op lifecycle (instance hooks inherited from Module)
 */

import { describe, expect, it } from 'vitest'
import { ConfigModule } from '../../src/config'
import { Module } from '../../src/module'
import { builtinSchemas } from '../../src/config'

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
