/**
 * MikroOrmMigrationRunner — concrete migration orchestrator on top of
 * MikroOrmBackendStorage + SqlMigrationStore + ComponentRegistry.
 *
 * Phase 1b strategy (validate architecture, defer file generation):
 *
 * For every install/uninstall, we recompose the FULL desired schema from
 * the currently-installed manifest set and ask MikroORM SchemaGenerator
 * to `updateSchema()` against the live DB. MikroORM's diff engine works
 * out the CREATE/ALTER/DROP statements by comparing target metadata to
 * actual DB state.
 *
 * Why this works without an explicit "partial diff":
 * - Install: target = installed ∪ {new}. MikroORM sees new tables / new
 *   columns and creates them.
 * - Uninstall: target = installed \ {gone}. MikroORM sees missing tables /
 *   missing columns (per metadata) and drops them.
 *
 * The OwnershipTracker is NOT used here for filtering — the composed
 * schema IS the desired state. Ownership is tracked for audit/UI purposes
 * (which manifest contributed what); destructive operations follow naturally.
 *
 * Phase 2 will add: per-manifest migration file generation (`.up.sql` /
 * `.down.sql`), hash-based identity, tampering detection, dev-time CLI.
 * The contract surface stays the same.
 */

import { lt as semverLt } from 'semver'
import {
  composePluginSchema,
  composeFullSchema,
  hashSchema,
  MigrationError,
  type ComposedSchema,
  type Migration,
  type SchemaMigrator,
  type SqlDialect,
} from '../migration'
import {
  loadUpgrades,
  resolveUpgradeChain,
  type UpgradeFile,
} from '../migration/hints'
import {
  ComponentConflictError,
  ComponentDependencyError,
  type ComponentManifest,
  type ComponentManifestId,
  type ComponentRegistry,
} from '../registry'
import { MikroOrmBackendStorage } from './MikroOrmBackendStorage'
import { MikroOrmSchemaMigrator } from './MikroOrmSchemaMigrator'
import { SqlMigrationStore } from './SqlMigrationStore'
import { StepExecutor } from './StepExecutor'

export interface MikroOrmMigrationRunnerOptions {
  storage: MikroOrmBackendStorage
  store: SqlMigrationStore
  registry: ComponentRegistry
  /** SQL dialect — for hash computation and future per-dialect file lookup. */
  dialect: SqlDialect
  /**
   * Optional SchemaMigrator override. Defaults to a
   * `MikroOrmSchemaMigrator` wrapping the storage. Inject your own
   * (e.g. a native dialect-aware migrator, or a Drizzle-backed one)
   * to swap the DDL diff engine without touching the runner.
   */
  migrator?: SchemaMigrator
}

export class MikroOrmMigrationRunner {
  private storage: MikroOrmBackendStorage
  private store: SqlMigrationStore
  private registry: ComponentRegistry
  private dialect: SqlDialect
  private migrator: SchemaMigrator

  constructor(opts: MikroOrmMigrationRunnerOptions) {
    this.storage = opts.storage
    this.store = opts.store
    this.registry = opts.registry
    this.dialect = opts.dialect
    this.migrator =
      opts.migrator ?? new MikroOrmSchemaMigrator(opts.storage)
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
  async install(componentId: ComponentManifestId, pluginPath?: string): Promise<Migration> {
    const entry = this.registry.get(componentId)
    if (!entry) {
      throw new MigrationError(`unknown plugin "${componentId}"`, componentId)
    }
    const manifest = entry.manifest

    // Verify all declared dependencies are currently installed/active.
    for (const dep of manifest.dependencies ?? []) {
      const depEntry = this.registry.get(dep.id)
      if (!depEntry || (depEntry.state !== 'installed' && depEntry.state !== 'active')) {
        throw new ComponentDependencyError(
          `cannot install "${componentId}": dependency "${dep.id}" is not installed`,
          componentId,
        )
      }
    }

    const migration = this.buildMigration(manifest)

    // Make sure the storage is connected before any MigrationStore call.
    // First-ever install bootstraps with just the system entities.
    await this.ensureStorageConnected()
    await this.store.init()

    // Idempotence: same plugin+hash already applied → no-op, return record.
    if (await this.store.isApplied(componentId, migration.hash)) {
      this.registry.setState(componentId, 'installed')
      return migration
    }

    // Downgrade detection — refuse if recorded version > target.
    const previousRow = await this.store.latestApplied(componentId)
    if (previousRow && semverLt(manifest.version, previousRow.pluginVersion)) {
      throw new MigrationError(
        `cannot install "${componentId}" v${manifest.version}: ` +
          `current state is v${previousRow.pluginVersion} (downgrade not supported)`,
        componentId,
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
      this.registry.setState(componentId, 'installed')
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
          `failed to load upgrade hints for "${componentId}": ` +
            loadErrors.map((e) => `${e.filePath}: ${e.error.message}`).join('; '),
          componentId,
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
    const desiredManifests = activeManifests.some((m) => m.id === componentId)
      ? activeManifests
      : [...activeManifests, manifest]
    const desired = toComposedSchema(composeFullSchema(desiredManifests))
    const previousComposed = previousRow?.renderedSchema ?? null

    // Delegate DDL emission to the SchemaMigrator. Default impl
    // (MikroOrmSchemaMigrator) handles the disconnect/reconnect of
    // MikroORM internally — additive install (allowDestructive: false).
    let appliedStmts: string[] = []
    try {
      const result = await this.migrator.computeMigration({
        previous: previousComposed,
        desired,
        dialect: this.dialect,
      })
      appliedStmts = result.up
    } catch (cause) {
      this.registry.setState(componentId, 'failed', cause as Error)
      throw new MigrationError(
        `install of "${componentId}" failed during DDL computation`,
        componentId,
        migration.hash,
        cause,
      )
    }

    // NOTE: do NOT re-call store.init() here. Two cases :
    //   • file SQLite : the disconnect/reconnect dance preserves the
    //     file, so qdcms_schema_state created at line 134 survives ;
    //     the diff sees it and won't emit CREATE for it.
    //   • :memory:    : disconnect wiped the DB, so the diff DOES
    //     emit CREATE qdcms_schema_state — executing it below
    //     recreates the table.
    // Calling `store.init()` here would conflict with the diff's
    // CREATE on the :memory: path (the diff doesn't use
    // IF NOT EXISTS).

    // Apply DDL statements. Each one runs through the storage's
    // execute() — implementation-agnostic.
    try {
      for (const stmt of appliedStmts) {
        await this.storage.getOrm().em.getConnection().execute(stmt)
      }
    } catch (cause) {
      this.registry.setState(componentId, 'failed', cause as Error)
      throw new MigrationError(
        `install of "${componentId}" failed while executing DDL`,
        componentId,
        migration.hash,
        cause,
      )
    }
    const appliedSql = appliedStmts.join(';\n')

    // Record the structural-diff outcome — UNLESS the hint chain
    // already recorded a row with this exact (plugin, hash). The chain's
    // last hint records the target-version state; the structural diff
    // is just a safety net and (in the happy path) emits no extra SQL,
    // so its row would be a duplicate.
    if (!(await this.store.isApplied(componentId, migration.hash))) {
      await this.store.recordExtended(migration, {
        pluginVersion: manifest.version,
        upgradeFile: null,
        renderedSchema: composePluginSchema(manifest),
        appliedSql,
      })
    }
    this.registry.setState(componentId, 'installed')
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
  async uninstall(componentId: ComponentManifestId): Promise<void> {
    const entry = this.registry.get(componentId)
    if (!entry) {
      throw new MigrationError(`unknown plugin "${componentId}"`, componentId)
    }
    if (entry.state !== 'installed' && entry.state !== 'active') {
      throw new MigrationError(
        `plugin "${componentId}" is not installed (state=${entry.state})`,
        componentId,
      )
    }
    // Refuse if any installed plugin depends on this one.
    for (const other of this.registry.list()) {
      if (other.manifest.id === componentId) continue
      if (other.state !== 'installed' && other.state !== 'active') continue
      const depends = other.manifest.dependencies?.some((d) => d.id === componentId)
      if (depends) {
        throw new ComponentConflictError(
          `cannot uninstall "${componentId}": "${other.manifest.id}" depends on it`,
          componentId,
        )
      }
    }

    const manifest = entry.manifest

    // Make sure storage is connected so the store table is reachable.
    await this.ensureStorageConnected()
    await this.store.init()

    // Schema-managed = false: skip DB schema work, just unrecord.
    if (manifest.schemaManaged === false) {
      const lastHash = await this.lastAppliedHash(componentId)
      if (lastHash) await this.store.unrecord(componentId, lastHash)
      this.registry.setState(componentId, 'registered')
      return
    }

    // Compose desired state = active minus this one.
    const remainingManifests = this.activeManifests().filter(
      (m) => m.id !== componentId,
    )
    const desired = toComposedSchema(composeFullSchema(remainingManifests))
    const previousRow = await this.store.latestApplied(componentId)
    const previousComposed: ComposedSchema | null = previousRow?.renderedSchema ?? null

    // Delegate to the SchemaMigrator. Uninstall is destructive
    // (drop the plugin's tables / extension columns) — set the
    // option so the migrator emits DROP statements as needed.
    let appliedStmts: string[] = []
    try {
      const result = await this.migrator.computeMigration({
        previous: previousComposed,
        desired,
        dialect: this.dialect,
        allowDestructive: true,
      })
      appliedStmts = result.up
    } catch (cause) {
      this.registry.setState(componentId, 'failed', cause as Error)
      throw new MigrationError(
        `uninstall of "${componentId}" failed during DDL computation`,
        componentId,
        undefined,
        cause,
      )
    }

    // Re-init the store table after the migrator's reconnect dance.
    await this.store.init()

    try {
      for (const stmt of appliedStmts) {
        await this.storage.getOrm().em.getConnection().execute(stmt)
      }
    } catch (cause) {
      this.registry.setState(componentId, 'failed', cause as Error)
      throw new MigrationError(
        `uninstall of "${componentId}" failed while executing DDL`,
        componentId,
        undefined,
        cause,
      )
    }

    const lastHash = await this.lastAppliedHash(componentId)
    if (lastHash) await this.store.unrecord(componentId, lastHash)
    this.registry.setState(componentId, 'registered')
  }

  /** Status query: per-plugin applied hashes. */
  async appliedFor(componentId: ComponentManifestId): Promise<string[]> {
    const rows = await this.store.appliedFor(componentId)
    return rows.map((r) => r.hash)
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private activeManifests(): ComponentManifest[] {
    return this.registry
      .list()
      .filter((e) => e.state === 'installed' || e.state === 'active')
      .map((e) => e.manifest)
  }

  private buildMigration(manifest: ComponentManifest): Migration {
    const composed = composePluginSchema(manifest)
    const hash = hashSchema({
      componentId: manifest.id,
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

  private async lastAppliedHash(componentId: ComponentManifestId): Promise<string | null> {
    const rows = await this.store.appliedFor(componentId)
    return rows.length > 0 ? rows[rows.length - 1].hash : null
  }

  // ─── helpers wired into the SchemaMigrator contract ────────────────────

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
    manifest: ComponentManifest,
  ): Promise<void> {
    const executor = new StepExecutor(this.storage, this.dialect)
    for (const file of chain) {
      const composedAtTarget = composePluginSchema(manifest)
      const intermediateHash = hashSchema({
        componentId: manifest.id,
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

// ─── module-level helpers ───────────────────────────────────────────────────

/**
 * Convert the flat physical-table map produced by composeFullSchema
 * into the `ComposedSchema` shape consumed by the SchemaMigrator
 * contract. After composition all extensions are merged into their
 * owning table; the migrator just needs the flat list.
 */
function toComposedSchema(
  fullSchema: Record<string, import('../entity/types').EntityDescriptor>,
): import('../migration/types').ComposedSchema {
  return {
    ownedTables: Object.values(fullSchema),
    extensions: {},
  }
}
