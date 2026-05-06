/**
 * SqlMigrationStore — MigrationStore impl over a SQL connection.
 *
 * Persists state-changing migration operations. The system table is
 * named `qdcms_schema_state` and is created by `init()` on first use
 * (idempotent — uses CREATE TABLE IF NOT EXISTS, dialect-portable).
 *
 * Schema (Phase 2 enriched):
 *   qdcms_schema_state
 *     plugin           TEXT     NOT NULL
 *     hash             TEXT     NOT NULL          ← of rendered schema after this transition
 *     applied_at       TEXT     NOT NULL          ← ISO-8601
 *     plugin_version   TEXT     NOT NULL          ← plugin version after this transition
 *     upgrade_file     TEXT                        ← upgrades/<version>.yaml applied (NULL if structural-diff only)
 *     rendered_schema  TEXT                        ← JSON snapshot of the composed schema (next-diff baseline)
 *     applied_sql      TEXT                        ← raw SQL executed (audit trail)
 *     PRIMARY KEY (plugin, hash)
 *
 * Use ANSI SQL only here so the same code works for SQLite/MariaDB/Postgres.
 */

import { EntitySchema } from '@mikro-orm/core'
import type {
  ComposedSchema,
  Migration,
  MigrationStore,
} from '../migration/types'
import { MikroOrmBackendStorage } from './MikroOrmBackendStorage'

const TABLE = 'qdcms_schema_state'

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    plugin TEXT NOT NULL,
    hash TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    plugin_version TEXT NOT NULL,
    upgrade_file TEXT,
    rendered_schema TEXT,
    applied_sql TEXT,
    PRIMARY KEY (plugin, hash)
  )
`

/**
 * MikroORM EntitySchema for the system tracking table. Always present
 * in the storage's entity set so MikroORM v6 has at least one entity
 * to init with even when no plugin is registered yet.
 */
export const SchemaStateEntity = new EntitySchema({
  name: TABLE,
  tableName: TABLE,
  properties: {
    plugin: { type: 'string', primary: true, length: 64 },
    hash: { type: 'string', primary: true, length: 64 },
    applied_at: { type: 'string', length: 32, fieldName: 'applied_at' },
    plugin_version: { type: 'string', length: 64, fieldName: 'plugin_version' },
    upgrade_file: { type: 'string', length: 128, nullable: true, fieldName: 'upgrade_file' },
    rendered_schema: { type: 'text', nullable: true, fieldName: 'rendered_schema' },
    applied_sql: { type: 'text', nullable: true, fieldName: 'applied_sql' },
  },
})

/**
 * Optional metadata recorded with each migration. The contract method
 * `record(migration)` accepts only the core Migration fields; richer
 * info (rendered_schema, applied_sql, upgrade_file) is set via
 * {@link SqlMigrationStore.recordExtended} which the runner uses.
 */
export interface ExtendedRecord {
  pluginVersion: string
  upgradeFile?: string | null
  renderedSchema?: ComposedSchema | null
  appliedSql?: string | null
}

/**
 * Row shape returned by `appliedFor` queries. Includes the new
 * Phase 2 columns; consumers that don't care can ignore them.
 */
export interface AppliedRow {
  hash: string
  appliedAt: Date
  pluginVersion: string
  upgradeFile: string | null
  renderedSchema: ComposedSchema | null
  appliedSql: string | null
}

export class SqlMigrationStore implements MigrationStore {
  constructor(private storage: MikroOrmBackendStorage) {}

  async init(): Promise<void> {
    const orm = this.storage.getOrm()
    await orm.em.getConnection().execute(CREATE_TABLE_SQL)
  }

  /**
   * Contract method — MigrationStore interface. Records with minimal
   * metadata (plugin_version defaults to migration.pluginVersion).
   * Use {@link recordExtended} when you have hint/snapshot data.
   */
  async record(migration: Migration): Promise<void> {
    await this.recordExtended(migration, { pluginVersion: migration.pluginVersion })
  }

  /**
   * Record with full Phase 2 metadata. Used by the runner when it has
   * the rendered schema snapshot, the upgrade file applied, and the
   * actual SQL executed.
   */
  async recordExtended(
    migration: Migration,
    extras: ExtendedRecord,
  ): Promise<void> {
    const orm = this.storage.getOrm()
    const now = new Date().toISOString()
    await orm.em.getConnection().execute(
      `INSERT INTO ${TABLE}
        (plugin, hash, applied_at, plugin_version, upgrade_file, rendered_schema, applied_sql)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        migration.plugin,
        migration.hash,
        now,
        extras.pluginVersion,
        extras.upgradeFile ?? null,
        extras.renderedSchema ? JSON.stringify(extras.renderedSchema) : null,
        extras.appliedSql ?? null,
      ],
    )
  }

  async unrecord(plugin: string, hash: string): Promise<void> {
    const orm = this.storage.getOrm()
    await orm.em.getConnection().execute(
      `DELETE FROM ${TABLE} WHERE plugin = ? AND hash = ?`,
      [plugin, hash],
    )
  }

  async appliedFor(plugin: string): Promise<{ hash: string; appliedAt: Date }[]> {
    const rows = await this.appliedForExtended(plugin)
    return rows.map((r) => ({ hash: r.hash, appliedAt: r.appliedAt }))
  }

  /**
   * Like `appliedFor` but returns the full Phase 2 row shape (with
   * plugin_version, upgrade_file, rendered_schema, applied_sql).
   */
  async appliedForExtended(plugin: string): Promise<AppliedRow[]> {
    const orm = this.storage.getOrm()
    const rows = (await orm.em.getConnection().execute<
      Array<{
        hash: string
        applied_at: string
        plugin_version: string
        upgrade_file: string | null
        rendered_schema: string | null
        applied_sql: string | null
      }>
    >(
      `SELECT hash, applied_at, plugin_version, upgrade_file, rendered_schema, applied_sql
       FROM ${TABLE}
       WHERE plugin = ?
       ORDER BY applied_at ASC`,
      [plugin],
    )) as Array<{
      hash: string
      applied_at: string
      plugin_version: string
      upgrade_file: string | null
      rendered_schema: string | null
      applied_sql: string | null
    }>
    return rows.map((r) => ({
      hash: r.hash,
      appliedAt: new Date(r.applied_at),
      pluginVersion: r.plugin_version,
      upgradeFile: r.upgrade_file,
      renderedSchema: r.rendered_schema
        ? (JSON.parse(r.rendered_schema) as ComposedSchema)
        : null,
      appliedSql: r.applied_sql,
    }))
  }

  /**
   * The latest applied row for a plugin, or null if nothing applied.
   * Used by the runner to read the previous state for diff baselining.
   */
  async latestApplied(plugin: string): Promise<AppliedRow | null> {
    const rows = await this.appliedForExtended(plugin)
    return rows.length > 0 ? rows[rows.length - 1] : null
  }

  async isApplied(plugin: string, hash: string): Promise<boolean> {
    const orm = this.storage.getOrm()
    const rows = await orm.em.getConnection().execute<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM ${TABLE} WHERE plugin = ? AND hash = ?`,
      [plugin, hash],
    )
    const c = rows[0]?.count ?? 0
    return Number(c) > 0
  }
}
