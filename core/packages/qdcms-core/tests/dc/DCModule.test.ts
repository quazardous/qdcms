/**
 * DCModule — skeleton declaration tests.
 *
 * Slice M7 ships only the static contract + kernel registrability.
 * Real entities + install logic land in M7b/c.
 */

import { describe, expect, it } from 'vitest'
import { ConfigModule } from '../../src/config'
import { DCModule, dcConfigSchemas } from '../../src/dc'
import { Kernel, registerSources } from '../../src/kernel'
import { Module } from '../../src/module'

describe('DCModule — static contract', () => {
  it('declares moduleName "dc"', () => {
    expect(DCModule.moduleName).toBe('dc')
  })

  it('requires the config slot (reads qdcms.locales for localised fields)', () => {
    expect(DCModule.requires).toEqual(['config'])
  })

  it('exposes its config schemas under the "dc" namespace', () => {
    expect(DCModule.configSchemas).toBe(dcConfigSchemas)
    expect(DCModule.configSchemas.length).toBeGreaterThan(0)
    expect(DCModule.configSchemas[0]?.namespace).toBe('dc')
  })

  it('declares no DB entities yet (M7b will add dc_type)', () => {
    expect(DCModule.entities).toEqual([])
  })
})

describe('DCModule — kernel integration', () => {
  it('extends the Module base class', () => {
    expect(new DCModule()).toBeInstanceOf(Module)
  })

  it('registers cleanly alongside ConfigModule and topo-sorts after it', () => {
    const kernel = new Kernel()
    registerSources(kernel, { modules: [ConfigModule, DCModule] })
    const order = kernel.topoSort()
    expect(order.indexOf('config')).toBeLessThan(order.indexOf('dc'))
  })

  it('contributes its dc.* schemas through the kernel aggregator', () => {
    const kernel = new Kernel()
    registerSources(kernel, { modules: [ConfigModule, DCModule] })
    const schemas = kernel.collectConfigSchemas()
    const namespaces = schemas.map((s) => s.namespace)
    expect(namespaces).toContain('qdcms') // ConfigModule
    expect(namespaces).toContain('dc') // DCModule
  })
})
