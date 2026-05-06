/**
 * @quazardous/qdcms-core/kernel — Kernel type contracts.
 *
 * The Kernel orchestrates Module + Plugin lifecycle and maintains a
 * registry of slots, each holding a chain of layered entries (see
 * docs/modules.md §4.1 chain semantics + §5 Kernel API).
 *
 * **Slice M4a scope** : data model + registration + queries + topo
 * sort + conflict detection. Boot lifecycle (install / connect /
 * registerHttpRoutes orchestration across the chain) ships in M4b.
 */

import type { Module } from '../module/Module'
import type { Plugin } from '../plugin/types'

/** Citizenship of a chain entry. */
export type Citizenship = 'module' | 'plugin'

/**
 * One entry in a slot's chain. The chain is ordered ascending by
 * `weight` ; the last (highest-weight) entry is the **active**
 * instance for the slot.
 */
export interface ChainEntry {
  /** The Module or Plugin instance. */
  readonly instance: Module | Plugin
  /** Where the entry came from (qdcms-core, '@x/qdcms-plugin-foo', …). */
  readonly origin: string
  /** Citizenship marker — informational, not gating. */
  readonly citizenship: Citizenship
  /** Position in the chain. Defaults to 0 for modules. */
  readonly weight: number
}

/**
 * One slot in the Kernel registry, identified by `name` (== plugin
 * `name` or Module `static moduleName`). The chain is bottom-to-top ;
 * the active instance is `chain.at(-1)`.
 */
export interface Slot {
  readonly name: string
  readonly chain: readonly ChainEntry[]
}

// ─── Errors ───────────────────────────────────────────────────────────────

export class KernelError extends Error {
  constructor(
    message: string,
    public readonly slotName?: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'KernelError'
  }
}

export class KernelChainConflictError extends KernelError {
  constructor(
    slotName: string,
    public readonly weight: number,
    public readonly origins: readonly [string, string],
  ) {
    super(
      `slot "${slotName}" has two entries with weight=${weight} : ` +
        `"${origins[0]}" and "${origins[1]}". Disambiguate by changing one's weight.`,
      slotName,
    )
    this.name = 'KernelChainConflictError'
  }
}

export class KernelDependencyError extends KernelError {
  constructor(message: string, slotName: string) {
    super(message, slotName)
    this.name = 'KernelDependencyError'
  }
}

export class KernelCycleError extends KernelError {
  constructor(public readonly cyclePath: readonly string[]) {
    super(`requires cycle detected : ${cyclePath.join(' → ')}`)
    this.name = 'KernelCycleError'
  }
}
