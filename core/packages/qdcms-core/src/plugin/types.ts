/**
 * @quazardous/qdcms-core/plugin — Plugin interface (public contract).
 *
 * A Plugin is a Module that ALSO satisfies a strict, versioned public
 * contract. See `docs/modules.md` §3 for the full design.
 *
 * **Plugin = discipline, not distribution.** A Plugin can ship as a
 * standalone npm package (the typical case, discovered via the
 * `qdcms-plugin` keyword in node_modules), as a local module inside a
 * monorepo workspace, or as a private file under an instance's
 * `plugins/` directory. The Kernel doesn't care how the loader finds
 * the instance — it just validates the shape against `PluginSchema`
 * and registers it. What makes something a Plugin (vs a `module`) is :
 *
 *  - it satisfies this strict interface (validated at the boundary),
 *  - it sticks to the public qdcms-core API (no reaching into
 *    internals),
 *  - it can be evolved at its own semver pace (independent of the
 *    framework's release cadence).
 *
 * Slice M2 ships :
 * - the interface (this file)
 * - a Valibot schema + validator (./schema.ts)
 *
 * The Kernel that orchestrates Plugin registration / topological sort /
 * chain-of-replacers handling lands with slice M4.
 */

import type { EntityDescriptor } from '../entity/types'
import type { Migration } from '../migration/types'
import type { NamespaceSchema } from '../config/schema'
import type {
  BackendContext,
  FrontendContext,
  HttpRouter,
} from '../module/types'

/**
 * Public contract every plugin must satisfy.
 *
 * Plugin authors typically write :
 *
 *   class DCPlugin extends Module implements Plugin {
 *     readonly id = '@quazardous/qdcms-plugin-dc'
 *     readonly name = 'dc'
 *     readonly prefix = 'dc'
 *     readonly version = '0.1.0'
 *     readonly requires = ['config'] as const
 *     readonly configSchemas = [dcTypesSchema]
 *     readonly entities = [dcTypeEntity]
 *     readonly migrations = []
 *     // …
 *   }
 *   export default new DCPlugin()
 *
 * Whatever loader picks up the export (npm-walker, file-system
 * scanner, instance-config bootstrap, …) hands the value to
 * `validatePlugin` then `kernel.registerPlugin`. See docs/modules.md
 * §4 for the chain-of-replacers semantics.
 */
export interface Plugin {
  // ─── Identity ────────────────────────────────────────────────

  /** npm-unique stable id (typically the package name). */
  readonly id: string
  /** Semver version (typically the package version). */
  readonly version: string
  /** Prefix used to namespace tables / config files (e.g. `dc`). */
  readonly prefix: string

  /**
   * Slot identity the Kernel keys on. Two plugins with the same `name`
   * collide unless one declares the other in `replaces`.
   */
  readonly name: string

  // ─── Topology ────────────────────────────────────────────────

  /** Names of slots this plugin needs to be active. */
  readonly requires?: readonly string[]

  /** Names of slots this plugin overrides (chain layering). */
  readonly replaces?: readonly string[]

  /**
   * Order in the slot's chain when multiple plugins replace it.
   * Higher = outer (active). Default 0.
   *
   * Two plugins replacing the same slot with the same weight is a
   * fatal collision detected at boot.
   */
  readonly weight?: number

  // ─── Contributions ───────────────────────────────────────────

  /** Validators for instance YAML files this plugin owns. */
  readonly configSchemas: readonly NamespaceSchema[]
  /** Entity descriptors this plugin contributes (its own DB tables). */
  readonly entities: readonly EntityDescriptor[]
  /** Migrations this plugin ships. */
  readonly migrations: readonly Migration[]

  /**
   * Inherited config-schema namespaces this plugin explicitly drops
   * when it `replaces` a predecessor. The compile pipeline emits a
   * deprecation warning if the user still has matching YAML ; after
   * one major bump the schema is unregistered. See docs/modules.md
   * §4.6.
   */
  readonly dropsConfigSchemas?: readonly string[]

  // ─── Lifecycle hooks ─────────────────────────────────────────

  /** Apply install-time side effects (run migrations, seed data). */
  install(ctx: BackendContext): Promise<void>
  /** Reverse install-time side effects. */
  uninstall(ctx: BackendContext): Promise<void>

  /** Contribute backend HTTP routes. Optional. */
  registerHttpRoutes?(router: HttpRouter, ctx: BackendContext): void

  /** Hook into the running frontend kernel. Optional. */
  connect?(ctx: FrontendContext): Promise<void>
  /** Mirror of `connect` for teardown. Optional. */
  disconnect?(): Promise<void>
}
