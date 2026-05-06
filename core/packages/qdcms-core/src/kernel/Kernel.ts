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
import { validatePlugin } from '../plugin/schema'
import type { Plugin } from '../plugin/types'
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
    // Plugin (instance readonly).
    const fromInstance = (active as { requires?: readonly string[] }).requires
    if (Array.isArray(fromInstance)) return fromInstance
    // Module (constructor static).
    const ctor = active.constructor as { requires?: readonly string[] }
    return ctor.requires ?? []
  }
}
