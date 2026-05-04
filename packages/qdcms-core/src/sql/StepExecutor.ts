/**
 * StepExecutor — executes UpgradeStep instances against the live DB.
 *
 * Each declarative step compiles to one or more SQL statements. Script
 * steps load a TS module and invoke its `upgrade(ctx)` function.
 *
 * The executor is dialect-aware — for Phase 2 it ships SQLite + a
 * generic SQL fallback for the other dialects (MariaDB / Postgres get
 * the same statements; differences come up in `change_type` and a few
 * edge cases noted inline).
 *
 * Steps reference entities by their LOGICAL name (the manifest's
 * `entities[name]`). The executor resolves the physical table name
 * via the plugin's prefix (idempotent if the entity tableName already
 * starts with `<prefix>_`).
 */

import { dirname, resolve as resolvePath } from 'node:path'
import type {
  AddFieldStep,
  AddIndexStep,
  ChangeTypeStep,
  DropFieldStep,
  DropIndexStep,
  RenameFieldStep,
  RenameTableStep,
  ScriptStep,
  UpgradeFile,
  UpgradeStep,
} from '../migration/hints/types'
import { MigrationError, type SqlDialect } from '../migration/types'
import type { PluginManifest } from '../plugin/types'
import { MikroOrmBackendStorage } from './MikroOrmBackendStorage'

export interface UpgradeContext {
  /** Run a raw SQL statement (no params for now — keep scripts honest). */
  exec(sql: string, params?: unknown[]): Promise<unknown>
  /** Current SQL dialect. */
  dialect: SqlDialect
  /** Structured logger. */
  logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }
  /** The plugin manifest at the version being upgraded TO. */
  manifest: PluginManifest
}

export interface ExecuteStepOptions {
  /** The plugin manifest at the version this hint upgrades TO. */
  manifest: PluginManifest
  /** Path of the YAML file the step came from (for resolving script paths). */
  upgradeFilePath: string
}

export interface ExecuteFileOptions {
  manifest: PluginManifest
}

export class StepExecutor {
  constructor(
    private storage: MikroOrmBackendStorage,
    private dialect: SqlDialect,
  ) {}

  /**
   * Execute every step of an UpgradeFile in order. Returns the
   * concatenated SQL run (for audit log).
   *
   * Note: Phase 2 does NOT wrap the file in a transaction. The
   * `storage.transaction(fn)` helper uses MikroORM's `em.transactional`
   * which forks the EM, but our `exec()` paths use the global EM's
   * connection — leading to a deadlock in better-sqlite3. Atomicity
   * across hint files is good-to-have but not load-bearing: the
   * structural-diff safety net runs last and converges any partial state.
   * Future Phase: refactor `storage.transaction` to expose a connection
   * scoped to the active transaction so we can safely wrap each file.
   */
  async executeFile(
    file: UpgradeFile,
    opts: ExecuteFileOptions,
  ): Promise<{ appliedSql: string }> {
    const sqlParts: string[] = []
    for (const step of file.steps) {
      const result = await this.executeStep(step, {
        manifest: opts.manifest,
        upgradeFilePath: file.filePath,
      })
      if (result.sql) sqlParts.push(result.sql)
    }
    return { appliedSql: sqlParts.join('\n') }
  }

  /** Dispatch a single step. */
  async executeStep(
    step: UpgradeStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    switch (step.kind) {
      case 'rename_field':
        return await this.renameField(step, opts)
      case 'add_field':
        return await this.addField(step, opts)
      case 'drop_field':
        return await this.dropField(step, opts)
      case 'rename_table':
        return await this.renameTable(step)
      case 'change_type':
        return await this.changeType(step, opts)
      case 'add_index':
        return await this.addIndex(step, opts)
      case 'drop_index':
        return await this.dropIndex(step, opts)
      case 'script':
        return await this.runScript(step, opts)
    }
  }

  // ─── Declarative steps ──────────────────────────────────────────────────

  private async renameField(
    step: RenameFieldStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    const table = this.resolveTableName(step.entity, opts.manifest)
    const sql = `ALTER TABLE ${table} RENAME COLUMN ${step.from} TO ${step.to}`
    await this.exec(sql)
    return { sql }
  }

  private async addField(
    step: AddFieldStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    const table = this.resolveTableName(step.entity, opts.manifest)

    // Field type — prefer the explicit `type` on the step (hint is
    // self-contained even when the field was later dropped); fall back
    // to the manifest if the hint omits it.
    let typeName: string
    let nullable: boolean
    let defaultLookup: { default?: unknown }
    if (step.type) {
      typeName = step.type
      nullable = step.nullable ?? true
      defaultLookup = {}
    } else {
      const fieldDef = this.resolveFieldDefinition(step.entity, step.field, opts.manifest)
      typeName = fieldDef.type
      nullable = fieldDef.nullable ?? false
      defaultLookup = { default: fieldDef.default }
    }
    const dialectType = this.mapType(typeName)
    const nullClause = nullable ? '' : ' NOT NULL'

    // 1) ALTER TABLE ADD COLUMN with appropriate default if backfill_default
    //    is set OR the column is NOT NULL (need a value for existing rows).
    const defaultClause = this.composeDefaultClause(step, defaultLookup)
    const addSql = `ALTER TABLE ${table} ADD COLUMN ${step.field} ${dialectType}${defaultClause}${nullClause}`
    const stmts: string[] = [addSql]
    await this.exec(addSql)

    // 2) Optional backfill_from / backfill_sql — UPDATE existing rows
    if (step.backfill_from) {
      const upd = `UPDATE ${table} SET ${step.field} = ${step.backfill_from}`
      stmts.push(upd)
      await this.exec(upd)
    } else if (step.backfill_sql) {
      const upd = `UPDATE ${table} SET ${step.field} = (${step.backfill_sql})`
      stmts.push(upd)
      await this.exec(upd)
    }

    return { sql: stmts.join(';\n') }
  }

  private async dropField(
    step: DropFieldStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    const table = this.resolveTableName(step.entity, opts.manifest)
    const sql = `ALTER TABLE ${table} DROP COLUMN ${step.field}`
    await this.exec(sql)
    return { sql }
  }

  private async renameTable(step: RenameTableStep): Promise<{ sql: string }> {
    const sql = `ALTER TABLE ${step.from} RENAME TO ${step.to}`
    await this.exec(sql)
    return { sql }
  }

  private async changeType(
    step: ChangeTypeStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    if (this.dialect === 'sqlite') {
      throw new MigrationError(
        `change_type is not supported on SQLite (no ALTER COLUMN TYPE). ` +
          `Use a script step that performs CREATE→COPY→DROP→RENAME.`,
        opts.manifest.id,
      )
    }
    const table = this.resolveTableName(step.entity, opts.manifest)
    const fieldDef = this.resolveFieldDefinition(step.entity, step.field, opts.manifest)
    const dialectType = this.mapType(fieldDef.type)
    const usingClause = step.cast ? ` USING ${step.cast}` : ''
    const sql =
      this.dialect === 'postgres'
        ? `ALTER TABLE ${table} ALTER COLUMN ${step.field} TYPE ${dialectType}${usingClause}`
        : // mariadb/mysql
          `ALTER TABLE ${table} MODIFY COLUMN ${step.field} ${dialectType}`
    await this.exec(sql)
    return { sql }
  }

  private async addIndex(
    step: AddIndexStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    const table = this.resolveTableName(step.entity, opts.manifest)
    const name =
      step.name ?? `idx_${table}_${step.fields.join('_')}${step.unique ? '_uniq' : ''}`
    const unique = step.unique ? 'UNIQUE ' : ''
    const sql = `CREATE ${unique}INDEX ${name} ON ${table} (${step.fields.join(', ')})`
    await this.exec(sql)
    return { sql }
  }

  private async dropIndex(
    step: DropIndexStep,
    _opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    // SQLite: DROP INDEX [IF EXISTS] index_name
    // MySQL: DROP INDEX index_name ON table_name
    // Postgres: DROP INDEX [IF EXISTS] index_name
    const sql =
      this.dialect === 'mariadb' || this.dialect === 'mysql'
        ? `DROP INDEX ${step.name} ON ${this.resolveTableName(step.entity, _opts.manifest)}`
        : `DROP INDEX ${step.name}`
    await this.exec(sql)
    return { sql }
  }

  private async runScript(
    step: ScriptStep,
    opts: ExecuteStepOptions,
  ): Promise<{ sql: string }> {
    const baseDir = dirname(opts.upgradeFilePath)
    const scriptPath = resolvePath(baseDir, step.script)

    // Dynamic import — vite/jest/vitest all handle this; in production
    // the runner may need to whitelist extensions or pre-bundle.
    const moduleUrl = `file://${scriptPath}`
    let mod: { upgrade?: (ctx: UpgradeContext) => Promise<void> | void }
    try {
      mod = (await import(moduleUrl)) as typeof mod
    } catch (cause) {
      throw new MigrationError(
        `failed to load script "${step.script}" from ${scriptPath}: ${(cause as Error).message}`,
        opts.manifest.id,
        undefined,
        cause,
      )
    }
    if (typeof mod.upgrade !== 'function') {
      throw new MigrationError(
        `script "${step.script}" must export an async function "upgrade(ctx)"`,
        opts.manifest.id,
      )
    }

    const ctx = this.makeContext(opts.manifest)
    try {
      await mod.upgrade(ctx)
    } catch (cause) {
      throw new MigrationError(
        `script "${step.script}" threw: ${(cause as Error).message}`,
        opts.manifest.id,
        undefined,
        cause,
      )
    }
    return { sql: `-- script: ${step.script} (no SQL captured — see audit log)` }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private resolveTableName(entity: string, manifest: PluginManifest): string {
    const ent = (manifest.entities ?? []).find((e) => e.name === entity)
    if (!ent) {
      throw new MigrationError(
        `entity "${entity}" not found in manifest of plugin "${manifest.id}"`,
        manifest.id,
      )
    }
    return ent.tableName.startsWith(`${manifest.prefix}_`)
      ? ent.tableName
      : `${manifest.prefix}_${ent.tableName}`
  }

  private resolveFieldDefinition(
    entity: string,
    field: string,
    manifest: PluginManifest,
  ): { type: string; nullable?: boolean; length?: number; default?: unknown } {
    const ent = (manifest.entities ?? []).find((e) => e.name === entity)
    if (!ent) {
      throw new MigrationError(
        `entity "${entity}" not found in manifest of plugin "${manifest.id}"`,
        manifest.id,
      )
    }
    const f = ent.fields[field]
    if (!f) {
      throw new MigrationError(
        `field "${field}" not found on entity "${entity}" in manifest of plugin "${manifest.id}"`,
        manifest.id,
      )
    }
    return f
  }

  private mapType(type: string): string {
    // Same mapping as descriptorToEntitySchema's TYPE_MAP — kept in sync
    // by convention. Could be factored out later.
    if (this.dialect === 'sqlite') {
      const map: Record<string, string> = {
        uuid: 'TEXT',
        string: 'TEXT',
        text: 'TEXT',
        integer: 'INTEGER',
        bigint: 'INTEGER',
        float: 'REAL',
        boolean: 'INTEGER',
        json: 'TEXT',
        date: 'TEXT',
        datetime: 'TEXT',
        timestamp: 'TEXT',
      }
      return map[type] ?? 'TEXT'
    }
    if (this.dialect === 'postgres') {
      const map: Record<string, string> = {
        uuid: 'UUID',
        string: 'VARCHAR(255)',
        text: 'TEXT',
        integer: 'INTEGER',
        bigint: 'BIGINT',
        float: 'DOUBLE PRECISION',
        boolean: 'BOOLEAN',
        json: 'JSONB',
        date: 'DATE',
        datetime: 'TIMESTAMP',
        timestamp: 'TIMESTAMP',
      }
      return map[type] ?? 'TEXT'
    }
    // mariadb / mysql
    const map: Record<string, string> = {
      uuid: 'CHAR(36)',
      string: 'VARCHAR(255)',
      text: 'TEXT',
      integer: 'INT',
      bigint: 'BIGINT',
      float: 'DOUBLE',
      boolean: 'TINYINT',
      json: 'JSON',
      date: 'DATE',
      datetime: 'DATETIME',
      timestamp: 'DATETIME',
    }
    return map[type] ?? 'TEXT'
  }

  private composeDefaultClause(
    step: AddFieldStep,
    fieldDef: { default?: unknown },
  ): string {
    if (step.backfill_default !== undefined) {
      return ` DEFAULT ${this.literalize(step.backfill_default)}`
    }
    if (fieldDef.default !== undefined) {
      if (fieldDef.default === 'now') return ` DEFAULT CURRENT_TIMESTAMP`
      return ` DEFAULT ${this.literalize(fieldDef.default)}`
    }
    return ''
  }

  private literalize(value: unknown): string {
    if (value === null) return 'NULL'
    if (typeof value === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') {
      // Naive escape — wrap and double single-quotes. Sufficient for
      // backfill defaults; not for arbitrary user input.
      return `'${value.replace(/'/g, "''")}'`
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  private async exec(sql: string): Promise<void> {
    await this.storage.getOrm().em.getConnection().execute(sql)
  }

  private makeContext(manifest: PluginManifest): UpgradeContext {
    return {
      exec: async (sql, params) =>
        await this.storage.getOrm().em.getConnection().execute(sql, params),
      dialect: this.dialect,
      manifest,
      logger: {
        info: (msg) => console.log(`[upgrade ${manifest.id}] ${msg}`),
        warn: (msg) => console.warn(`[upgrade ${manifest.id}] ${msg}`),
        error: (msg) => console.error(`[upgrade ${manifest.id}] ${msg}`),
      },
    }
  }
}
