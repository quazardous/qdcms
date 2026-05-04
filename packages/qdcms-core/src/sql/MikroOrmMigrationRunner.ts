/**
 * MikroOrmMigrationRunner — concrete migration orchestrator on top of
 * MikroOrmBackendStorage + SqlMigrationStore + PluginRegistry.
 *
 * Phase 1b strategy (validate architecture, defer file generation):
 *
 * For every install/uninstall, we recompose the FULL desired schema from
 * the currently-installed plugin set and ask MikroORM SchemaGenerator to
 * `updateSchema()` against the live DB. MikroORM's diff engine works out
 * the CREATE/ALTER/DROP statements by comparing target metadata to actual
 * DB state.
 *
 * Why this works without an explicit "partial diff":
 * - Install: target = installed ∪ {new}. MikroORM sees new tables / new
 *   columns and creates them.
 * - Uninstall: target = installed \ {gone}. MikroORM sees missing tables /
 *   missing columns (per metadata) and drops them.
 *
 * The OwnershipTracker is NOT used here for filtering — the composed
 * schema IS the desired state. Ownership is tracked for audit/UI purposes
 * (which plugin contributed what); destructive operations follow naturally.
 *
 * Phase 2 will add: per-plugin migration file generation (`.up.sql` /
 * `.down.sql`), hash-based identity, tampering detection, dev-time CLI.
 * The contract surface stays the same.
 */

import { lt as semverLt } from 'semver'
import {
  composePluginSchema,
  composeFullSchema,
  hashSchema,
  MigrationError,
  type Migration,
  type SqlDialect,
} from '../migration'
import {
  loadUpgrades,
  resolveUpgradeChain,
  type UpgradeFile,
} from '../migration/hints'
import {
  PluginConflictError,
  PluginDependencyError,
  type Plugin,
  type PluginId,
  type PluginManifest,
  type PluginRegistry,
} from '../plugin'
import { MikroOrmBackendStorage } from './MikroOrmBackendStorage'
import { SqlMigrationStore } from './SqlMigrationStore'
import { StepExecutor } from './StepExecutor'

export interface MikroOrmMigrationRunnerOptions {
  storage: MikroOrmBackendStorage
  store: SqlMigrationStore
  registry: PluginRegistry
  /** SQL dialect — for hash computation and future per-dialect file lookup. */
  dialect: SqlDialect
}

export class MikroOrmMigrationRunner {
  private storage: MikroOrmBackendStorage
  private store: SqlMigrationStore
  private registry: PluginRegistry
  private dialect: SqlDialect

  constructor(opts: MikroOrmMigrationRunnerOptions) {
    this.storage = opts.storage
    this.store = opts.store
    this.registry = opts.registry
    this.dialect = opts.dialect
  }

  /**
   * Install (or upgrade) a plugin.
   *
   * Behaviour:
   * - If the plugin has never been applied → fresh install: optionally
   *   apply hint files <= manifest.version (in semver order), then run
   *   the structural diff.
   * - If a previous version is recorded and is < manifest.version →
   *   upgrade: load hints, resolve chain (current, target], apply each
   *   in order via StepExecutor, then structural diff as safety net.
   * - If recorded version == manifest.version → idempotent no-op.
   * - If recorded version > manifest.version → throws (downgrade not
   *   supported in Phase 2).
   *
   * Pass `pluginPath` so the runner can find `<pluginPath>/upgrades/`.
   * Without it, no hints are consulted (Phase 1b behaviour).
   *
   * Throws if:
   * - plugin not in registry
   * - any dependency is not currently installed
   * - hints chain has a min_version guard the running state can't satisfy
   * - storage is not connected or fails mid-update
   */
  async install(pluginId: PluginId, pluginPath?: string): Promise<Migration> {
    const entry = this.registry.get(pluginId)
    if (!entry) {
      throw new MigrationError(`unknown plugin "${pluginId}"`, pluginId)
    }
    const manifest = entry.plugin.manifest

    // Verify all declared dependencies are currently installed/active.
    for (const dep of manifest.dependencies ?? []) {
      const depEntry = this.registry.get(dep.id)
      if (!depEntry || (depEntry.state !== 'installed' && depEntry.state !== 'active')) {
        throw new PluginDependencyError(
          `cannot install "${pluginId}": dependency "${dep.id}" is not installed`,
          pluginId,
        )
      }
    }

    const migration = this.buildMigration(manifest)

    // Make sure the storage is connected before any MigrationStore call.
    // First-ever install bootstraps with just the system entities.
    await this.ensureStorageConnected()
    await this.store.init()

    // Idempotence: same plugin+hash already applied → no-op, return record.
    if (await this.store.isApplied(pluginId, migration.hash)) {
      this.registry.setState(pluginId, 'installed')
      return migration
    }

    // Downgrade detection — refuse if recorded version > target.
    const previousRow = await this.store.latestApplied(pluginId)
    if (previousRow && semverLt(manifest.version, previousRow.pluginVersion)) {
      throw new MigrationError(
        `cannot install "${pluginId}" v${manifest.version}: ` +
          `current state is v${previousRow.pluginVersion} (downgrade not supported)`,
        pluginId,
      )
    }

    // Schema-managed = false: skip DB schema work but still track state.
    if (manifest.schemaManaged === false) {
      await this.store.recordExtended(migration, {
        pluginVersion: manifest.version,
        upgradeFile: null,
        renderedSchema: composePluginSchema(manifest),
        appliedSql: null,
      })
      this.registry.setState(pluginId, 'installed')
      return migration
    }

    // ─── Apply hint files (if any) before the structural diff ─────────
    // Phase 2: hints live at <pluginPath>/upgrades/<target>.yaml.
    // The runner discovers them, resolves the chain (current, target],
    // applies each in transaction via StepExecutor, records each
    // transition, then runs the structural diff as a safety net.
    if (pluginPath) {
      const { files: upgradeFiles, errors: loadErrors } =
        await loadUpgrades(pluginPath)
      if (loadErrors.length > 0) {
        throw new MigrationError(
          `failed to load upgrade hints for "${pluginId}": ` +
            loadErrors.map((e) => `${e.filePath}: ${e.error.message}`).join('; '),
          pluginId,
        )
      }
      const { chain } = resolveUpgradeChain({
        currentVersion: previousRow?.pluginVersion ?? null,
        targetVersion: manifest.version,
        files: upgradeFiles,
      })
      if (chain.length > 0) {
        await this.applyHintChain(chain, manifest)
      }
    }

    // Compose desired state = currently active + this one.
    const activeManifests = this.activeManifests()
    const desiredManifests = activeManifests.some((m) => m.id === pluginId)
      ? activeManifests
      : [...activeManifests, manifest]
    const desired = composeFullSchema(desiredManifests)

    // Reload MikroORM with new entity set, then ask SchemaGenerator to
    // converge the live DB. Two-step disconnect/reconnect because v6
    // metadata is fixed at init.
    await this.storage.disconnect()
    this.storage.registerEntities(Object.values(desired))
    await this.storage.connect()
    await this.store.init() // ensure system table exists post-reconnect

    let appliedSql: string | null = null
    try {
      // Capture the SQL via getUpdateSchemaSQL() before applying — gives
      // us the audit trail. Then call updateSchema() which actually
      // applies it. Tiny double-traversal but small in practice.
      const generator = this.storage.getOrm().getSchemaGenerator()
      appliedSql = await generator.getUpdateSchemaSQL({
        safe: false,
        dropTables: false,
      })
      await generator.updateSchema({ safe: false, dropTables: false })
    } catch (cause) {
      this.registry.setState(pluginId, 'failed', cause as Error)
      throw new MigrationError(
        `install of "${pluginId}" failed during schema update`,
        pluginId,
        migration.hash,
        cause,
      )
    }

    // Record the structural-diff outcome — UNLESS the hint chain
    // already recorded a row with this exact (plugin, hash). The chain's
    // last hint records the target-version state; the structural diff
    // is just a safety net and (in the happy path) emits no extra SQL,
    // so its row would be a duplicate.
    if (!(await this.store.isApplied(pluginId, migration.hash))) {
      await this.store.recordExtended(migration, {
        pluginVersion: manifest.version,
        upgradeFile: null,
        renderedSchema: composePluginSchema(manifest),
        appliedSql,
      })
    }
    this.registry.setState(pluginId, 'installed')
    return migration
  }

  /**
   * Uninstall a plugin: compute the new full schema (without this one),
   * update the DB (drops the removed tables and extension columns), then
   * unrecord the migration.
   *
   * Throws if:
   * - plugin not installed
   * - any other installed plugin depends on this one (registry refuses)
   */
  async uninstall(pluginId: PluginId): Promise<void> {
    const entry = this.registry.get(pluginId)
    if (!entry) {
      throw new MigrationError(`unknown plugin "${pluginId}"`, pluginId)
    }
    if (entry.state !== 'installed' && entry.state !== 'active') {
      throw new MigrationError(
        `plugin "${pluginId}" is not installed (state=${entry.state})`,
        pluginId,
      )
    }
    // Refuse if any installed plugin depends on this one.
    for (const other of this.registry.list()) {
      if (other.plugin.manifest.id === pluginId) continue
      if (other.state !== 'installed' && other.state !== 'active') continue
      const depends = other.plugin.manifest.dependencies?.some((d) => d.id === pluginId)
      if (depends) {
        throw new PluginConflictError(
          `cannot uninstall "${pluginId}": "${other.plugin.manifest.id}" depends on it`,
          pluginId,
        )
      }
    }

    const manifest = entry.plugin.manifest

    // Make sure storage is connected so the store table is reachable.
    await this.ensureStorageConnected()
    await this.store.init()

    // Schema-managed = false: skip DB schema work, just unrecord.
    if (manifest.schemaManaged === false) {
      const lastHash = await this.lastAppliedHash(pluginId)
      if (lastHash) await this.store.unrecord(pluginId, lastHash)
      this.registry.setState(pluginId, 'registered')
      return
    }

    // Compose desired state = active minus this one.
    const remainingManifests = this.activeManifests().filter(
      (m) => m.id !== pluginId,
    )
    const desired = composeFullSchema(remainingManifests)

    await this.storage.disconnect()
    this.storage.registerEntities(Object.values(desired))
    await this.storage.connect()
    await this.store.init()

    try {
      const generator = this.storage.getOrm().getSchemaGenerator()
      // SQL captured for audit but not yet persisted on uninstall —
      // we just unrecord the row. Future Phase 2 enrichment may keep
      // a "uninstall trace" log table.
      void (await generator.getUpdateSchemaSQL({
        safe: false,
        dropTables: true,
      }))
      await generator.updateSchema({ safe: false, dropTables: true })
    } catch (cause) {
      this.registry.setState(pluginId, 'failed', cause as Error)
      throw new MigrationError(
        `uninstall of "${pluginId}" failed during schema update`,
        pluginId,
        undefined,
        cause,
      )
    }

    const lastHash = await this.lastAppliedHash(pluginId)
    if (lastHash) await this.store.unrecord(pluginId, lastHash)
    this.registry.setState(pluginId, 'registered')
  }

  /** Status query: per-plugin applied hashes. */
  async appliedFor(pluginId: PluginId): Promise<string[]> {
    const rows = await this.store.appliedFor(pluginId)
    return rows.map((r) => r.hash)
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private activeManifests(): PluginManifest[] {
    return this.registry
      .list()
      .filter((e) => e.state === 'installed' || e.state === 'active')
      .map((e) => e.plugin.manifest)
  }

  private buildMigration(manifest: PluginManifest): Migration {
    const composed = composePluginSchema(manifest)
    const hash = hashSchema({
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      schema: composed,
      dialect: this.dialect,
    })
    return {
      plugin: manifest.id,
      pluginVersion: manifest.version,
      hash,
      dialect: this.dialect,
      // .up / .down deferred to Phase 2 (file generation via SchemaGenerator
      // diff captured at dev-time instead of regenerated at runtime).
      up: '',
      down: '',
    }
  }

  private async lastAppliedHash(pluginId: PluginId): Promise<string | null> {
    const rows = await this.store.appliedFor(pluginId)
    return rows.length > 0 ? rows[rows.length - 1].hash : null
  }

  /**
   * Apply a chain of upgrade hint files. Each file runs in its own
   * transaction (delegated to the StepExecutor). After each successful
   * file, a row is inserted in qdcms_schema_state with the rendered
   * schema snapshot at that intermediate version and a separate hash.
   *
   * The chain advances the persisted plugin_version step by step, so a
   * crash in the middle leaves a consistent on-disk state at the last
   * successfully-applied version (the next upgrade attempt resumes
   * from there).
   */
  private async applyHintChain(
    chain: UpgradeFile[],
    manifest: PluginManifest,
  ): Promise<void> {
    const executor = new StepExecutor(this.storage, this.dialect)
    for (const file of chain) {
      const composedAtTarget = composePluginSchema(manifest)
      const intermediateHash = hashSchema({
        pluginId: manifest.id,
        pluginVersion: file.targetVersion,
        schema: composedAtTarget,
        dialect: this.dialect,
      })
      try {
        const { appliedSql } = await executor.executeFile(file, { manifest })
        await this.store.recordExtended(
          {
            plugin: manifest.id,
            pluginVersion: file.targetVersion,
            hash: intermediateHash,
            dialect: this.dialect,
            up: appliedSql,
            down: '',
          },
          {
            pluginVersion: file.targetVersion,
            upgradeFile: file.filePath.split('/').slice(-1)[0],
            renderedSchema: composedAtTarget,
            appliedSql,
          },
        )
      } catch (cause) {
        this.registry.setState(manifest.id, 'failed', cause as Error)
        throw new MigrationError(
          `upgrade hint "${file.filePath}" failed: ${(cause as Error).message}`,
          manifest.id,
          intermediateHash,
          cause,
        )
      }
    }
  }

  /**
   * Lazy connect — the storage requires non-empty entities at init, so we
   * defer connection until the first install/uninstall. Subsequent calls
   * reconnect with updated entity sets.
   */
  private async ensureStorageConnected(): Promise<void> {
    try {
      this.storage.getOrm()
      // Already connected — nothing to do.
    } catch {
      await this.storage.connect()
    }
  }
}

// Re-export for convenient typing on the consumer side.
export type { Plugin } from '../plugin'
