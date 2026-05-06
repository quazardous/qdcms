/**
 * Kernel registration helpers.
 *
 * **Loaders are plural.** Each discovery pattern is its own loader :
 * static module list (hardcoded by the host), node_modules walker for
 * plugins, instance-local filesystem scanner, explicit YAML-driven
 * import list, …
 *
 * What they all share is the registration entry point on the Kernel —
 * `registerModule` (citizenship='module') for statically-imported
 * modules and `registerPlugin` (citizenship='plugin') for everything
 * the loaders bring in dynamically. Both are validated at the kernel
 * boundary (modules trust the framework, plugins go through
 * `validatePlugin`).
 *
 * `registerSources` below is just **convenience** — a one-call helper
 * for hosts that have already collected sources from N loaders and
 * want to feed them into the kernel in one shot.
 */

import { Module } from '../module/Module'
import type { Plugin } from '../plugin/types'
import type { Kernel } from './Kernel'

/** Anything a loader can produce as a Module input. */
export type ModuleSource = Module | (new () => Module)

export interface KernelSources {
  /**
   * Modules to register at citizenship='module'. Classes are
   * instantiated with no arguments ; instances pass through.
   */
  modules?: readonly ModuleSource[]
  /**
   * Plugins to register at citizenship='plugin'. Each runs through
   * `validatePlugin` inside `registerPlugin` — malformed entries
   * throw `PluginValidationError` and abort the call.
   */
  plugins?: readonly Plugin[]
}

/**
 * Register every module + plugin source on the kernel. Modules go
 * first so plugin registration can resolve `requires` / `replaces`
 * against an already-populated registry.
 *
 * The function takes the OUTPUTS of one or more loaders (whichever
 * the host wired up) — it's not itself a loader.
 */
export function registerSources(kernel: Kernel, sources: KernelSources): void {
  for (const m of sources.modules ?? []) {
    const instance = m instanceof Module ? m : new m()
    kernel.registerModule(instance)
  }
  for (const p of sources.plugins ?? []) {
    kernel.registerPlugin(p)
  }
}
