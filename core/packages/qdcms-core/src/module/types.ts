/**
 * @quazardous/qdcms-core/module — Module type contracts.
 *
 * Augmentation of qdadm's Module concept with the hooks qdcms needs :
 * compile-time (configSchemas, cliCommands), backend (entities,
 * migrations, registerHttpRoutes, install/uninstall) on top of the
 * existing frontend lifecycle (connect/disconnect/loadStyles).
 *
 * See `docs/modules.md` §2 for the design rationale.
 *
 * The contexts (KernelContext, BackendContext, FrontendContext) are
 * intentionally open at this stage — concrete shapes get nailed down
 * by the Kernel slice (M4). Until then any host can pass its own bag
 * and modules read what they need.
 */

import type { EntityDescriptor } from '../entity/types'
import type { Migration } from '../migration/types'
import type { NamespaceSchema } from '../config/schema'

// ─── Context placeholders (M4 will tighten) ───────────────────────────────

/**
 * Common context surface seen by every Module hook. Hosts extend this
 * with their own services. Keep narrow at this stage — specific contexts
 * (BackendContext, FrontendContext) extend it.
 */
export interface KernelContext {
  [key: string]: unknown
}

/**
 * Context passed to backend lifecycle hooks (`install`, `uninstall`,
 * `registerHttpRoutes`). Will gain `kernel`, `storage`, `config`, etc.
 * once the Kernel lands.
 */
export interface BackendContext extends KernelContext {}

/**
 * Context passed to frontend lifecycle hooks (`connect`, `disconnect`).
 * Aligns with the existing qdadm KernelContext shape via duck typing.
 */
export interface FrontendContext extends KernelContext {}

/**
 * Opaque router type passed to `registerHttpRoutes`. The actual shape is
 * defined by whoever implements the backend HTTP layer ; modules just
 * call methods on it. Concrete typing arrives with the Kernel slice.
 */
export type HttpRouter = unknown

// ─── Static shape (the class side of a Module) ────────────────────────────

/**
 * Static (constructor-level) properties a Module class declares. Mirrors
 * qdadm's `ModuleStatic` and adds the qdcms-side hooks.
 *
 * Modules implement this implicitly by extending the `Module` base class
 * and overriding the static fields they care about. The host walks
 * `(MyModule as ModuleStatic).{configSchemas,entities,...}` at boot.
 */
export interface ModuleStatic {
  // ─── Identity (qdadm-existing) ────────────────────────────────
  moduleName: string
  requires: readonly string[]
  priority: number

  // ─── Frontend (qdadm-existing) ────────────────────────────────
  styles: (() => Promise<unknown>) | null

  // ─── Compile-time (qdcms additions) ───────────────────────────
  /** Validators for instance YAML files this module owns. */
  configSchemas: readonly NamespaceSchema[]
  /** Path to an oclif commands directory this module contributes. */
  cliCommands: string | null

  // ─── Backend (qdcms additions) ────────────────────────────────
  /** Entity descriptors this module owns (its DB tables). */
  entities: readonly EntityDescriptor[]
  /** Migrations this module ships. */
  migrations: readonly Migration[]
}

/**
 * Constructor options carried by every Module instance.
 */
export interface ModuleOptions {
  name?: string
  [key: string]: unknown
}

// ─── Re-exports for convenience ───────────────────────────────────────────

export type { EntityDescriptor, Migration, NamespaceSchema }
