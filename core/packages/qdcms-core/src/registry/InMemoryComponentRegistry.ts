/**
 * InMemoryComponentRegistry — minimal reference implementation of the
 * `ComponentRegistry` contract.
 *
 * **Use this for tests, prototypes, and small apps.** Production hosts
 * (qdcms-backend, qdadm) should ship their own implementation that:
 * - loads available manifests from YAML config (project-declared)
 * - reads a DB table for runtime overrides (which available plugins are
 *   enabled, per-plugin user config) — admin UI manageable
 * - persists state changes (`setState`) back to the same DB table
 *
 * The contract surface is identical (same `ComponentRegistry` interface);
 * only the persistence and discovery strategies differ.
 *
 * Responsibilities of THIS implementation:
 * - Register manifests with manifest validation
 * - Detect prefix collisions and id duplicates
 * - Resolve install order via topological sort over `dependencies`
 * - Detect dependency cycles (DFS three-color coloring)
 * - Detect missing dependencies
 * - Expose ownership queries (which manifest owns which entity / extends which table)
 *
 * NOT in scope here (deferred to higher layers):
 * - Actually running install/activate hooks (= MigrationRunner job)
 * - Loading manifests from YAML (= CLI / loader job)
 * - Persisting state across reboots (= host job)
 */

import {
  ComponentConflictError,
  ComponentDependencyError,
  type ComponentManifest,
  type ComponentManifestId,
  type ComponentRegistry,
  type ComponentRegistryEntry,
  type ComponentRegistryState,
} from './types'
import { validateComponentManifest } from './validation'

export class InMemoryComponentRegistry implements ComponentRegistry {
  private entries = new Map<ComponentManifestId, ComponentRegistryEntry>()

  /**
   * Register a manifest. Throws on:
   * - invalid manifest (ComponentValidationError, via validateComponentManifest)
   * - duplicate id (ComponentConflictError)
   * - prefix collision with an already-registered manifest (ComponentConflictError)
   */
  register(manifest: ComponentManifest): void {
    validateComponentManifest(manifest)
    const { id, prefix } = manifest

    if (this.entries.has(id)) {
      throw new ComponentConflictError(
        `manifest "${id}" is already registered`,
        id,
      )
    }
    for (const [otherId, entry] of this.entries) {
      if (entry.manifest.prefix === prefix) {
        throw new ComponentConflictError(
          `manifest "${id}" prefix "${prefix}" collides with manifest "${otherId}"`,
          id,
        )
      }
    }

    this.entries.set(id, { manifest, state: 'registered' })
  }

  /** Remove a manifest from the registry. No lifecycle action — purely table-level. */
  unregister(id: ComponentManifestId): void {
    if (!this.entries.has(id)) {
      throw new ComponentDependencyError(
        `cannot unregister "${id}": not registered`,
        id,
      )
    }
    // Refuse if any other manifest depends on this one.
    for (const [otherId, entry] of this.entries) {
      if (otherId === id) continue
      if (entry.manifest.dependencies?.some((d) => d.id === id)) {
        throw new ComponentDependencyError(
          `cannot unregister "${id}": "${otherId}" depends on it`,
          id,
        )
      }
    }
    this.entries.delete(id)
  }

  has(id: ComponentManifestId): boolean {
    return this.entries.has(id)
  }

  get(id: ComponentManifestId): ComponentRegistryEntry | undefined {
    return this.entries.get(id)
  }

  list(): ComponentRegistryEntry[] {
    return Array.from(this.entries.values())
  }

  /** All known manifests, in registration order. */
  manifests(): ComponentManifest[] {
    return this.list().map((e) => e.manifest)
  }

  // ─── State transitions (pure book-keeping; runner drives them) ──────────

  setState(id: ComponentManifestId, state: ComponentRegistryState, lastError?: Error): void {
    const entry = this.entries.get(id)
    if (!entry) {
      throw new ComponentDependencyError(`unknown manifest "${id}"`, id)
    }
    entry.state = state
    if (state === 'failed') {
      entry.lastError = lastError
    } else {
      delete entry.lastError
    }
  }

  // ─── Dependency resolution ──────────────────────────────────────────────

  /**
   * Topological sort: returns manifest ids in the order they must be
   * installed (a manifest appears after all its dependencies). Throws
   * on missing deps and on cycles.
   *
   * Algorithm: DFS with three-color marking (white/gray/black). Gray
   * on re-visit = cycle. White = unvisited.
   */
  resolveOrder(): ComponentManifestId[] {
    const order: ComponentManifestId[] = []
    const color = new Map<ComponentManifestId, 'white' | 'gray' | 'black'>()
    for (const id of this.entries.keys()) color.set(id, 'white')

    const visit = (id: ComponentManifestId, stack: ComponentManifestId[]): void => {
      const c = color.get(id)
      if (c === 'black') return
      if (c === 'gray') {
        const cyclePath = [...stack, id].join(' → ')
        throw new ComponentDependencyError(
          `dependency cycle detected: ${cyclePath}`,
          id,
        )
      }
      color.set(id, 'gray')
      const deps = this.entries.get(id)?.manifest.dependencies ?? []
      for (const dep of deps) {
        const depEntry = this.entries.get(dep.id)
        if (!depEntry) {
          throw new ComponentDependencyError(
            `manifest "${id}" depends on "${dep.id}" which is not registered`,
            id,
          )
        }
        // NOTE: dep.version range satisfaction is NOT checked here —
        // npm is authoritative for version resolution (see
        // docs/plugins.md §16). The loader trusts that the versions
        // in node_modules already satisfy each manifest's
        // package.json#peerDependencies; npm refuses the install
        // otherwise. Our role here is just topo-sort + cycle detection.
        visit(dep.id, [...stack, id])
      }
      color.set(id, 'black')
      order.push(id)
    }

    for (const id of this.entries.keys()) visit(id, [])
    return order
  }

  /**
   * Cross-manifest extension validation: every extension target must be
   * a table owned by a manifest that's a declared dependency. Run this
   * AFTER all manifests are registered.
   */
  validateExtensions(): void {
    for (const entry of this.entries.values()) {
      const m = entry.manifest
      if (!m.extensions) continue
      const declaredDeps = new Set(
        (m.dependencies ?? []).map((d) => d.id),
      )
      for (const tableName of Object.keys(m.extensions)) {
        // Find which registered manifest owns this table.
        const ownerId = this.findTableOwner(tableName)
        if (!ownerId) {
          throw new ComponentDependencyError(
            `manifest "${m.id}" extends unknown table "${tableName}"`,
            m.id,
          )
        }
        if (ownerId === m.id) {
          // Extending its own table is a no-op vs. just declaring fields
          // — flag as a manifest mistake.
          throw new ComponentDependencyError(
            `manifest "${m.id}" cannot extend its own table "${tableName}" — declare fields directly on the entity instead`,
            m.id,
          )
        }
        if (!declaredDeps.has(ownerId)) {
          throw new ComponentDependencyError(
            `manifest "${m.id}" extends "${tableName}" (owned by "${ownerId}") but does not declare it as a dependency`,
            m.id,
          )
        }
      }
    }
  }

  /**
   * Resolve the manifest id that owns a fully-prefixed table name.
   * Looks at each manifest's `entities[*].tableName` after prefixing.
   *
   * Naming convention enforced here: physical name = `${prefix}_${entityTable}`
   * unless the entity's `tableName` already starts with `${prefix}_`.
   */
  findTableOwner(physicalTableName: string): ComponentManifestId | undefined {
    for (const entry of this.entries.values()) {
      const m = entry.manifest
      const prefix = m.prefix
      for (const ent of m.entities ?? []) {
        const physical = ent.tableName.startsWith(`${prefix}_`)
          ? ent.tableName
          : `${prefix}_${ent.tableName}`
        if (physical === physicalTableName) return m.id
      }
    }
    return undefined
  }
}
