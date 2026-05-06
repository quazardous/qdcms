/**
 * @quazardous/qdcms-core/registry — entity-manifest registry.
 *
 * **Transitional layer.** The new Module/Plugin contract documented in
 * `docs/modules.md` is the long-term home for these concepts. Today the
 * migration runtime still consumes the simple manifest shape declared
 * here ; it will migrate to walking `Module[]` once the Kernel exists
 * (slice M4). Until then this file is the data shape + minimal registry
 * that the migration runner needs.
 *
 * Pure types and minimal interfaces. The reference implementation lives
 * in `./InMemoryComponentRegistry.ts` ; lifecycle execution lives in
 * higher layers (qdcms-backend, qdadm) that compose with the migration
 * runner and storage.
 */

import type { EntityDescriptor } from '../entity/types'

// ─── Manifest (declarative scope) ─────────────────────────────────────────

/**
 * Sem-ver version string. Validated at registry time via {@link isValidSemver}.
 */
export type ComponentManifestVersion = string

/**
 * Manifest id. Lowercase, snake-case-ish: `core`, `dynamic_content`, `my-shop`.
 *
 * Validated against `/^[a-z0-9][a-z0-9._-]*$/` (npm-aligned, scoped names
 * accepted) at registry time.
 */
export type ComponentManifestId = string

/**
 * Prefix used to namespace tables (e.g. `dc` → tables `dc_posts`).
 *
 * Must be `/^[a-z][a-z0-9_]*$/`. Cannot contain `-` (would break table
 * naming on some dialects). Two manifests with the same prefix is a hard
 * conflict — the registry refuses to load the second.
 */
export type ComponentManifestPrefix = string

export interface ComponentDependency {
  /** Manifest id required. */
  id: ComponentManifestId
  /**
   * Sem-ver range. Defaults to `'*'` (any version).
   * Examples: `'^1.0.0'`, `'>=2.3.0'`, `'1.x'`.
   */
  version?: string
}

/**
 * The minimum description any entity-providing party (framework module
 * or plugin) must give the migration runtime.
 */
export interface ComponentManifest {
  id: ComponentManifestId
  version: ComponentManifestVersion
  prefix: ComponentManifestPrefix
  /** Human-friendly title — surfaced in admin UI / debug bar. */
  title?: string
  /** One-line description. */
  description?: string
  /** Other manifests this one needs to be active. */
  dependencies?: ComponentDependency[]
  /**
   * Entity descriptors this manifest contributes (its own tables). The
   * composer prefixes them with `prefix_` and stamps `owner = id`.
   */
  entities?: EntityDescriptor[]
  /**
   * Extensions: columns added to other manifests' tables, keyed by the
   * FULLY-QUALIFIED foreign table name (`core_users`).
   *
   * The extending manifest MUST list the owning manifest in
   * `dependencies`, otherwise the registry rejects it.
   */
  extensions?: Record<string, EntityDescriptor['fields']>
  /**
   * If `false`, qdcms does NOT manage this party's schema (no migration
   * generation, no diff at install). Use for plugins that integrate with
   * an externally-managed backend. Default: `true`.
   */
  schemaManaged?: boolean
}

// ─── Lifecycle state (tracked by the registry) ────────────────────────────

export type ComponentRegistryState =
  | 'registered' // manifest loaded, hooks not yet run
  | 'installed'  // install() succeeded, schema migrated
  | 'active'     // activate() succeeded, the live state for the role
  | 'inactive'   // deactivate() succeeded, paused but installed
  | 'failed'     // a hook threw — needs operator intervention

export interface ComponentRegistryEntry {
  manifest: ComponentManifest
  state: ComponentRegistryState
  /**
   * If the entry is in the `failed` state, the error that caused it.
   * Cleared on the next successful transition.
   */
  lastError?: Error
}

// ─── Registry contract ────────────────────────────────────────────────────

/**
 * The entity-manifest registry contract.
 *
 * **qdcms ships a minimal reference implementation** (`InMemoryComponentRegistry`)
 * suitable for tests and small apps. **Hosts SHOULD provide their own
 * implementation** for production, with project-aware loading and
 * persistence (see qdcms-backend).
 */
export interface ComponentRegistry {
  /**
   * Add a manifest. Throws on:
   * - invalid manifest (ComponentValidationError)
   * - duplicate id or prefix collision (ComponentConflictError)
   */
  register(manifest: ComponentManifest): void

  /** Remove a manifest. Throws if other manifests depend on it. */
  unregister(id: ComponentManifestId): void

  has(id: ComponentManifestId): boolean
  get(id: ComponentManifestId): ComponentRegistryEntry | undefined
  list(): ComponentRegistryEntry[]
  manifests(): ComponentManifest[]

  /**
   * Update tracked state for a manifest. Called by the runner after
   * each successful or failed lifecycle transition.
   */
  setState(id: ComponentManifestId, state: ComponentRegistryState, lastError?: Error): void

  /**
   * Topological sort: returns manifest ids in install order. Throws
   * on missing dependencies and dependency cycles.
   */
  resolveOrder(): ComponentManifestId[]

  /**
   * Cross-manifest extension validation: every extension's target table
   * owner must be a declared dependency of the extending manifest.
   */
  validateExtensions(): void

  /**
   * Resolve which manifest owns a fully-prefixed physical table name.
   * Returns undefined when no registered manifest owns the table.
   */
  findTableOwner(physicalTableName: string): ComponentManifestId | undefined
}

// ─── Errors ───────────────────────────────────────────────────────────────

export class ComponentRegistryError extends Error {
  constructor(
    message: string,
    public readonly componentId?: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ComponentRegistryError'
  }
}

export class ComponentConflictError extends ComponentRegistryError {
  constructor(message: string, componentId: string) {
    super(message, componentId)
    this.name = 'ComponentConflictError'
  }
}

export class ComponentDependencyError extends ComponentRegistryError {
  constructor(message: string, componentId: string) {
    super(message, componentId)
    this.name = 'ComponentDependencyError'
  }
}

export class ComponentValidationError extends ComponentRegistryError {
  constructor(message: string, componentId?: string) {
    super(message, componentId)
    this.name = 'ComponentValidationError'
  }
}
