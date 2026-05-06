/**
 * MikroOrmSchemaMigrator — implements `SchemaMigrator` by delegating
 * the actual DDL diff computation to MikroORM's `SchemaGenerator`.
 *
 * Why a wrapper? It lets the migration runner stay agnostic of the
 * underlying schema-diff engine. Drop in a native impl, a knex-based
 * one, or anything that emits SQL strings — the runner code is the
 * same. MikroORM is just one (heavy, robust) backend among many.
 *
 * The MikroORM SchemaGenerator uses LIVE DB introspection to compute
 * the update SQL — it ignores the `previous` snapshot in our contract
 * and reads the actual DB state instead. That is acceptable: the
 * contract says "compute the SQL needed to converge to desired", the
 * migrator decides whether to lean on a snapshot or on introspection.
 *
 * MikroORM v6 has the constraint that entity metadata is fixed at
 * init time. To compute the diff for a new desired entity set, the
 * migrator reconfigures the storage (disconnect → registerEntities →
 * reconnect) before asking SchemaGenerator. This is a MikroORM-
 * specific dance and lives entirely inside this class — the runner
 * never sees it.
 */

import type { EntityDescriptor } from '../entity/types'
import type {
  ComposedSchema,
  SchemaMigrator,
  SchemaMigratorInput,
} from '../migration/types'
import { MikroOrmBackendStorage } from './MikroOrmBackendStorage'

export interface MikroOrmSchemaMigratorOptions {
  storage: MikroOrmBackendStorage
}

/**
 * MikroORM-specific tuning options. Pass via
 * `SchemaMigratorInput.options`. Defaults are sensible for the runner.
 */
export interface MikroOrmSchemaMigratorRunOptions {
  /**
   * If `true` (default), the migrator reconfigures the storage with
   * the desired entities before computing the diff. Set `false` only
   * when the caller has already done it (rare — runner internal use).
   */
  reconfigureStorage?: boolean
}

export class MikroOrmSchemaMigrator implements SchemaMigrator {
  constructor(private storage: MikroOrmBackendStorage) {}

  async computeMigration(input: SchemaMigratorInput): Promise<{ up: string[]; down: string[] }> {
    const opts = (input.options ?? {}) as MikroOrmSchemaMigratorRunOptions
    const reconfigure = opts.reconfigureStorage !== false
    const allowDestructive = input.allowDestructive ?? false

    // MikroORM v6: entity metadata is fixed at init. To get the
    // SchemaGenerator to compute "DB → desired" diff, we must
    // re-init MikroORM with the desired entity set first.
    if (reconfigure) {
      const entities = collectAllDescriptors(input.desired)
      await this.storage.disconnect()
      this.storage.registerEntities(entities)
      await this.storage.connect()
    }

    // SchemaGenerator returns a single SQL blob with multiple
    // statements separated by `;\n`. We split into individual stmts so
    // the runner executes them one at a time (better error reporting +
    // easier transaction control).
    const generator = this.storage.getOrm().getSchemaGenerator()
    const blob = await generator.getUpdateSchemaSQL({
      safe: false,
      dropTables: allowDestructive,
    })

    return {
      up: splitSqlStatements(blob),
      // MikroORM SchemaGenerator does not naturally provide the
      // inverse. Computing it would require swapping previous/desired
      // and a second pass — for now we leave `down` empty. A native
      // SchemaMigrator implementation can return both directions in a
      // single pass and runner consumers that need rollback will use
      // it instead.
      down: [],
    }
  }
}

// ─── internals ────────────────────────────────────────────────────────────

/**
 * Flatten a ComposedSchema into the list of EntityDescriptors that
 * the storage needs to register with MikroORM. Owned tables and
 * extension columns merge into the owned-table descriptor before this
 * (handled by composeFullSchema). The migrator just gets the final
 * shape.
 */
function collectAllDescriptors(schema: ComposedSchema): EntityDescriptor[] {
  // Extensions are already merged into ownedTables by the composer
  // (composeFullSchema) — at this point we just register the merged
  // tables. The migrator never sees `extensions` separately.
  return schema.ownedTables
}

/**
 * Split a multi-statement SQL blob (statements separated by `;`) into
 * individual statements. Skips empty lines and comments. Naive but
 * sufficient for SchemaGenerator output, which doesn't contain
 * inline-quoted semicolons.
 */
function splitSqlStatements(blob: string): string[] {
  if (!blob) return []
  return blob
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))
}
