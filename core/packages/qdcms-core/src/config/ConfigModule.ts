/**
 * ConfigModule — the central config hub.
 *
 * **Owns the high-level config layer** : what every other Module /
 * Plugin contributes (schemas), what the user authors (instance YAML),
 * and the compile pipeline that turns the latter into typed TS modules
 * the runtime imports. Centralisation, sharing, and (eventually)
 * override of high-level config is its responsibility.
 *
 * **Scope = authoring config + the gray zone.** Two clear-cut
 * categories sit at the edges :
 *  - **High-level authoring** (locales, page types, plugin enable
 *    list, content models, theming) — clearly inside ConfigModule.
 *  - **Low-level infra** (DB URL, ports, deployment secrets) —
 *    clearly outside : env vars + the host bootstrap.
 * Between them lives a **gray zone** : configs that are technically
 * low-level (cache TTLs, internal feature flags, default JWT issuer,
 * rate-limit thresholds…) but that several modules need to share.
 * Those belong in ConfigModule too — centralised + typed + validated
 * — but flagged so they don't surface in the admin UI by default.
 *
 * **Forward direction (not yet shipped)** :
 * - **Sharing** : a `connect(ctx)` that provides the compiled config
 *   bag to other modules at runtime — `ctx.config.get('qdcms.locales')`.
 * - **Visibility + editability are orthogonal.** Two flags per
 *   concept :
 *   - `protected` (default `false`) — when true, the concept is
 *     read-only to humans : the admin UI surfaces it for
 *     **inspection** (so an operator can debug what a plugin is
 *     consuming) but offers no editor. The override layer skips
 *     it. The gray-zone home.
 *   - `hidden` (default `false`) — when true, the concept is
 *     omitted from the admin UI entirely. Modules still consume
 *     it through ConfigModule at runtime ; humans don't see it
 *     at all.
 *   `secret` is just convention : a concept marked
 *   `{ source: 'env', protected: true, hidden: true }` is sourced
 *   from env vars (never in YAML), invisible in admin, read-only.
 *   Composes with the existing field-level `locked: true` (locks
 *   a single field after install — useful on otherwise-public
 *   concepts to pin identity values).
 * - **Override layer** : an admin-driven runtime tier (slice C9)
 *   backed by a `qdcms_config_live` table, allowing the admin to
 *   tweak any non-locked, non-protected concept post-install.
 *   Protected concepts bypass this entirely.
 * - **Admin UI** : a qdadm-side panel that, for every concept
 *   the active visibility flags allow, surfaces it as either an
 *   editor form (public, non-locked) or a read-only inspector
 *   (`protected`). `hidden` concepts are omitted. Schema-driven :
 *   the same `field()` DSL that validates compile also generates
 *   the form / inspector UI. ConfigModule registers the panel
 *   through qdadm's slot system at connect-time.
 *
 * **Citizenship = 'module'.** Config is framework-essential. An
 * instance can't disable it. A fancier compiler arrives as a separate
 * plugin (`qdcms-plugin-config-compile-rust`) replacing only the
 * compile-time bits, leaving ConfigModule as the schema hub.
 */

import { Module } from '../module'
import { builtinSchemas } from './builtin-schemas'
import { compileConfig } from './compile'
import type {
  CompileConfigOptions,
  CompileConfigResult,
} from './types'
import type { Kernel } from '../kernel/Kernel'

export interface ConfigModuleCompileOptions {
  /** Path to the instance config directory. */
  instanceDir: string
  /** Output directory for compiled artefacts. Defaults per compileConfig. */
  outDir?: string
  /**
   * The Kernel populated with the host's modules + plugins. Their
   * `configSchemas` (static or instance, as a Plugin would expose
   * them) are aggregated and passed to the compiler.
   *
   * If omitted, only `extraSchemas` are used — useful for tests
   * that don't want to construct a kernel.
   */
  kernel?: Kernel
  /**
   * Extra schemas to merge on top of the kernel's. Tests use this
   * to pin exact schema sets ; production code typically only uses
   * the kernel.
   */
  extraSchemas?: readonly import('./schema').NamespaceSchema[]
  /** Bypass the compile cache (used by `qdcms config:doctor`). */
  noCache?: boolean
}

export class ConfigModule extends Module {
  /** Slot name in the Kernel registry. */
  static moduleName = 'config'

  /**
   * Load order : config must be available before anything else can
   * read its YAML or rely on schema-registered plugins. Negative
   * priority keeps it at the head of the topological sort.
   */
  static priority = -100

  /**
   * Framework-owned config namespaces (`qdcms.*`). Plugins extend
   * the registry by contributing their own `plugin-<short>.*`
   * schemas via their own Module / Plugin definitions.
   */
  static configSchemas = builtinSchemas

  /**
   * The framework's CLI commands (`config:compile`, `config:doctor`,
   * `install`, …) live in `@quazardous/qdcms-cli` rather than
   * alongside this module. They are the canonical qdcms binary, not
   * module-contributed extras. `cliCommands` stays null — only
   * extension modules / plugins that ship their own commands set it.
   */
  static cliCommands: string | null = null

  /**
   * No DB entities yet. Slice C9 (`qdcms_config_live` for
   * admin-side runtime overrides) will land here.
   */
  static entities = [] as const

  /**
   * Compile the instance YAML into typed TS modules, sourcing the
   * schema registry from the kernel's whole topology (so every
   * Module / Plugin's `configSchemas` participate in validation).
   *
   * This is the public entry point for the compile pipeline ; CLI
   * commands and other tooling should use it instead of calling the
   * underlying `compileConfig` primitive directly.
   *
   * @example
   *   const kernel = new Kernel()
   *   registerSources(kernel, { modules: [ConfigModule, AuthModule] })
   *   const result = await ConfigModule.compile({
   *     instanceDir: 'demo/config',
   *     kernel,
   *   })
   */
  static async compile(
    opts: ConfigModuleCompileOptions,
  ): Promise<CompileConfigResult> {
    const fromKernel = opts.kernel ? opts.kernel.collectConfigSchemas() : []
    // Dedup by namespace : if a caller passes both kernel + extras,
    // extras win (the override layer pattern).
    const byNamespace = new Map<string, import('./schema').NamespaceSchema>()
    for (const s of fromKernel) byNamespace.set(s.namespace, s)
    for (const s of opts.extraSchemas ?? []) byNamespace.set(s.namespace, s)

    const compileOpts: CompileConfigOptions = {
      instanceDir: opts.instanceDir,
      outDir: opts.outDir,
      schemas: Array.from(byNamespace.values()),
      noCache: opts.noCache,
    }
    return compileConfig(compileOpts)
  }
}

export default ConfigModule
