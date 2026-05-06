/**
 * Kernel — slot registry + topology resolution for Modules and Plugins.
 *
 * Maintains a Map<slotName, Slot> where each slot holds a chain of
 * entries (Module/Plugin instances) ordered ascending by weight. The
 * top of the chain is the **active** instance for the slot — what
 * `kernel.get(name)` returns and (eventually, in M4b) what dispatches
 * user-facing hooks.
 *
 * **Slice M4a scope (this file)** :
 * - `registerModule(m)` — adds a Module instance to its own slot at
 *   weight 0. Module citizenship.
 * - `registerPlugin(p)` — adds a Plugin instance to its own slot, plus
 *   layers it onto every slot in `replaces`. Validates the plugin
 *   shape via `validatePlugin` first.
 * - `get(name)` / `slot(name)` / `list()` — read API.
 * - `replaced(name, caller)` — chain lookup helper used by wrapping
 *   plugins (see docs/modules.md §4.4).
 * - `topoSort()` — returns the order of slots respecting `requires`,
 *   throws on cycles / missing requires.
 * - Conflict detection : two entries in the same slot with the same
 *   weight throws `KernelChainConflictError`.
 *
 * **Boot lifecycle (install / connect / registerHttpRoutes
 * orchestration)** lives in M4b — `kernel.boot()` walks the topo
 * order and invokes the right hooks per phase.
 */

import { Module } from '../module/Module'
import type {
  BackendContext,
  FrontendContext,
  HttpRouter,
} from '../module/types'
import { validatePlugin } from '../plugin/schema'
import type { Plugin } from '../plugin/types'
import type { NamespaceSchema } from '../config/schema'
import {
  KernelChainConflictError,
  KernelCycleError,
  KernelDependencyError,
  type ChainEntry,
  type Slot,
} from './types'

interface InternalSlot {
  name: string
  chain: ChainEntry[]
}

export interface RegisterModuleOptions {
  /** Origin tag (defaults to 'qdcms-core'). */
  origin?: string
  /** Override for the chain entry's weight (defaults to 0). */
  weight?: number
}

export interface RegisterPluginOptions {
  /** Origin tag (defaults to plugin.id). */
  origin?: string
  /** Skip Valibot validation (caller has already done it). */
  skipValidation?: boolean
}

export class Kernel {
  private slots = new Map<string, InternalSlot>()

  // ─── Registration ────────────────────────────────────────────

  /**
   * Register a Module instance under its own slot (the static
   * `moduleName`). Modules don't carry `replaces` ; they always sit
   * at weight 0 in their own slot.
   */
  registerModule(instance: Module, options: RegisterModuleOptions = {}): void {
    const ctor = instance.constructor as typeof Module
    const name = ctor.moduleName
    if (!name || name === 'base') {
      throw new KernelDependencyError(
        `module class "${ctor.name}" must declare a static moduleName ` +
          `(got "${name ?? '<undefined>'}")`,
        name ?? '<unknown>',
      )
    }
    const entry: ChainEntry = {
      instance,
      origin: options.origin ?? 'qdcms-core',
      citizenship: 'module',
      weight: options.weight ?? 0,
    }
    this.appendChainEntry(name, entry)
  }

  /**
   * Register a Plugin instance. Validates the shape via Valibot first
   * (unless skipped), then layers the plugin on :
   *  - its own `name` slot (one entry at the plugin's weight),
   *  - every slot in `replaces` (one entry each, same weight).
   *
   * Throws `KernelChainConflictError` when two entries land in the
   * same slot with the same weight.
   */
  registerPlugin(plugin: Plugin, options: RegisterPluginOptions = {}): void {
    if (!options.skipValidation) {
      validatePlugin(plugin)
    }
    const origin = options.origin ?? plugin.id
    const weight = plugin.weight ?? 0
    const slots = [plugin.name, ...(plugin.replaces ?? [])]
    for (const slotName of slots) {
      this.appendChainEntry(slotName, {
        instance: plugin,
        origin,
        citizenship: 'plugin',
        weight,
      })
    }
  }

  // ─── Queries ─────────────────────────────────────────────────

  /**
   * The active instance (top of chain) for a slot, or undefined if
   * the slot doesn't exist.
   */
  get(name: string): Module | Plugin | undefined {
    const slot = this.slots.get(name)
    if (!slot || slot.chain.length === 0) return undefined
    return slot.chain[slot.chain.length - 1]!.instance
  }

  /** Full slot record (chain + name), or undefined. */
  slot(name: string): Slot | undefined {
    const internal = this.slots.get(name)
    if (!internal) return undefined
    return { name: internal.name, chain: [...internal.chain] }
  }

  /** All known slots, in registration order. */
  list(): readonly Slot[] {
    return Array.from(this.slots.values()).map((s) => ({
      name: s.name,
      chain: [...s.chain],
    }))
  }

  /**
   * The instance immediately below `caller` in the slot's chain, or
   * undefined if `caller` is at the bottom (or not in this slot's
   * chain). Used by wrapping plugins to delegate to their predecessor
   * (see docs/modules.md §4.4).
   */
  replaced(name: string, caller: Module | Plugin): Module | Plugin | undefined {
    const slot = this.slots.get(name)
    if (!slot) return undefined
    const idx = slot.chain.findIndex((e) => e.instance === caller)
    if (idx <= 0) return undefined
    return slot.chain[idx - 1]!.instance
  }

  /**
   * Full chain bottom-to-top, EXCLUDING the caller. Used when a
   * wrapper wants to walk every predecessor (rare).
   */
  replacedChain(name: string, caller: Module | Plugin): readonly (Module | Plugin)[] {
    const slot = this.slots.get(name)
    if (!slot) return []
    const idx = slot.chain.findIndex((e) => e.instance === caller)
    if (idx <= 0) return []
    return slot.chain.slice(0, idx).map((e) => e.instance)
  }

  // ─── Topological sort ────────────────────────────────────────

  /**
   * Return slot names in install order : a slot appears after every
   * slot it `requires`. Uses the **active** instance of each slot for
   * the requires lookup so chain layering doesn't break dependency
   * resolution.
   *
   * Throws `KernelDependencyError` on missing requires,
   * `KernelCycleError` on cycles.
   */
  topoSort(): string[] {
    const order: string[] = []
    const color = new Map<string, 'white' | 'gray' | 'black'>()
    for (const name of this.slots.keys()) color.set(name, 'white')

    const visit = (name: string, stack: string[]): void => {
      const c = color.get(name)
      if (c === 'black') return
      if (c === 'gray') {
        throw new KernelCycleError([...stack, name])
      }
      color.set(name, 'gray')
      const requires = this.requiresOf(name)
      for (const dep of requires) {
        if (!this.slots.has(dep)) {
          throw new KernelDependencyError(
            `slot "${name}" requires "${dep}" which is not registered`,
            name,
          )
        }
        visit(dep, [...stack, name])
      }
      color.set(name, 'black')
      order.push(name)
    }

    for (const name of this.slots.keys()) visit(name, [])
    return order
  }

  // ─── Compile-time aggregation ────────────────────────────────

  /**
   * Aggregate every Module + Plugin's `configSchemas` across the
   * whole topology. Used by the compile pipeline (CLI's
   * `qdcms config:compile`) to walk the schema registry without
   * caring about citizenship or chain layering.
   *
   * Each instance contributes its schemas exactly once, even when it
   * sits in multiple slots (consolidator plugin in `replaces` =
   * many slots, same instance).
   *
   * Reads either the instance's `readonly configSchemas` (Plugin
   * pattern) or the constructor's `static configSchemas` (Module
   * pattern), preferring instance over static when both exist.
   */
  collectConfigSchemas(): readonly NamespaceSchema[] {
    const out: NamespaceSchema[] = []
    const seen = new Set<Module | Plugin>()
    for (const slot of this.slots.values()) {
      for (const entry of slot.chain) {
        if (seen.has(entry.instance)) continue
        seen.add(entry.instance)
        const schemas = readArrayContribution<NamespaceSchema>(
          entry.instance,
          'configSchemas',
        )
        out.push(...schemas)
      }
    }
    return out
  }

  // ─── Lifecycle dispatch ──────────────────────────────────────

  /**
   * Backend install : iterate slots in topological order, walk each
   * chain bottom-to-top, call `install(ctx)` on every entry. Wrappers
   * see their predecessors' state because predecessors run first.
   *
   * Each instance runs `install` at most once even if it appears in
   * multiple slots' chains (consolidator pattern).
   */
  async installAll(ctx: BackendContext): Promise<void> {
    const order = this.topoSort()
    const installed = new Set<Module | Plugin>()
    for (const slotName of order) {
      const slot = this.slots.get(slotName)!
      for (const entry of slot.chain) {
        if (installed.has(entry.instance)) continue
        installed.add(entry.instance)
        const inst = entry.instance as { install?: (c: BackendContext) => Promise<void> }
        if (typeof inst.install === 'function') {
          await inst.install(ctx)
        }
      }
    }
  }

  /**
   * Backend uninstall : mirror of `installAll`. Slots in reverse topo,
   * each chain top-to-bottom. Wrappers tear down before their
   * predecessors.
   */
  async uninstallAll(ctx: BackendContext): Promise<void> {
    const order = this.topoSort().slice().reverse()
    const uninstalled = new Set<Module | Plugin>()
    for (const slotName of order) {
      const slot = this.slots.get(slotName)!
      for (let i = slot.chain.length - 1; i >= 0; i--) {
        const entry = slot.chain[i]!
        if (uninstalled.has(entry.instance)) continue
        uninstalled.add(entry.instance)
        const inst = entry.instance as {
          uninstall?: (c: BackendContext) => Promise<void>
        }
        if (typeof inst.uninstall === 'function') {
          await inst.uninstall(ctx)
        }
      }
    }
  }

  /**
   * Backend HTTP routes : the **active** instance of each slot
   * registers routes. Predecessors stay silent — they're reachable
   * to wrappers via `replaced(slot, caller)` but they don't own
   * routes once superseded.
   */
  registerAllHttpRoutes(router: HttpRouter, ctx: BackendContext): void {
    const order = this.topoSort()
    const seen = new Set<Module | Plugin>()
    for (const slotName of order) {
      const active = this.get(slotName)
      if (!active || seen.has(active)) continue
      seen.add(active)
      const inst = active as {
        registerHttpRoutes?: (r: HttpRouter, c: BackendContext) => void
      }
      if (typeof inst.registerHttpRoutes === 'function') {
        inst.registerHttpRoutes(router, ctx)
      }
    }
  }

  /**
   * Frontend connect : active instance only, in topo order. Modules
   * + plugins that own a slot's role wire their UI / signal listeners
   * here.
   */
  async connectAll(ctx: FrontendContext): Promise<void> {
    const order = this.topoSort()
    const seen = new Set<Module | Plugin>()
    for (const slotName of order) {
      const active = this.get(slotName)
      if (!active || seen.has(active)) continue
      seen.add(active)
      const inst = active as { connect?: (c: FrontendContext) => Promise<void> }
      if (typeof inst.connect === 'function') {
        await inst.connect(ctx)
      }
    }
  }

  /** Mirror of `connectAll`. Active only, reverse topo. */
  async disconnectAll(): Promise<void> {
    const order = this.topoSort().slice().reverse()
    const seen = new Set<Module | Plugin>()
    for (const slotName of order) {
      const active = this.get(slotName)
      if (!active || seen.has(active)) continue
      seen.add(active)
      const inst = active as { disconnect?: () => Promise<void> }
      if (typeof inst.disconnect === 'function') {
        await inst.disconnect()
      }
    }
  }

  /**
   * Pre-connect frontend hook : load every active instance's styles.
   * Runs before `connectAll` so the CSS is applied by the time
   * `connect` mounts components.
   */
  async loadStylesAll(): Promise<void> {
    const order = this.topoSort()
    const seen = new Set<Module | Plugin>()
    for (const slotName of order) {
      const active = this.get(slotName)
      if (!active || seen.has(active)) continue
      seen.add(active)
      const inst = active as { loadStyles?: () => Promise<void> }
      if (typeof inst.loadStyles === 'function') {
        await inst.loadStyles()
      }
    }
  }

  // ─── Internals ───────────────────────────────────────────────

  private appendChainEntry(slotName: string, entry: ChainEntry): void {
    const slot = this.slots.get(slotName) ?? { name: slotName, chain: [] }
    if (!this.slots.has(slotName)) this.slots.set(slotName, slot)

    // Conflict : another entry with the same weight in this slot.
    for (const existing of slot.chain) {
      if (existing.weight === entry.weight) {
        throw new KernelChainConflictError(slotName, entry.weight, [
          existing.origin,
          entry.origin,
        ])
      }
    }

    // Sorted insertion (ascending weight).
    const insertIdx = slot.chain.findIndex((e) => e.weight > entry.weight)
    if (insertIdx === -1) slot.chain.push(entry)
    else slot.chain.splice(insertIdx, 0, entry)
  }

  /**
   * Read the `requires` declaration for a slot's active instance.
   * Plugins expose it as an instance readonly property ; Modules
   * expose it as a constructor static. The Kernel reads whichever
   * is present.
   */
  private requiresOf(slotName: string): readonly string[] {
    const slot = this.slots.get(slotName)
    if (!slot || slot.chain.length === 0) return []
    const active = slot.chain[slot.chain.length - 1]!.instance
    return readArrayContribution<string>(active, 'requires')
  }
}

// ─── Module-level helpers ───────────────────────────────────────────────────

/**
 * Read an array-typed contribution field from a Module/Plugin instance.
 * Plugins declare it as `readonly` instance property ; Modules use a
 * constructor static. Instance wins when both exist.
 */
function readArrayContribution<T>(
  instance: Module | Plugin,
  key: string,
): readonly T[] {
  const fromInstance = (instance as unknown as Record<string, unknown>)[key]
  if (Array.isArray(fromInstance)) return fromInstance as T[]
  const fromCtor = (instance.constructor as unknown as Record<string, unknown>)[
    key
  ]
  if (Array.isArray(fromCtor)) return fromCtor as T[]
  return []
}
