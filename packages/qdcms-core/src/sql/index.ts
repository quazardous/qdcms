/**
 * @quazardous/qdcms-core/sql — SQL-backed implementations of the
 * migration and storage contracts. Built on MikroORM (currently 6.x).
 *
 * **Node-only.** Pulls MikroORM and a SQL driver. Browser bundles must
 * not import from this subpath.
 */

export {
  descriptorToEntitySchema,
  descriptorsToEntitySchemas,
} from './descriptorToEntitySchema'

export {
  MikroOrmBackendStorage,
  type MikroOrmBackendStorageOptions,
} from './MikroOrmBackendStorage'

export {
  SqlMigrationStore,
  SchemaStateEntity,
  type AppliedRow,
  type ExtendedRecord,
} from './SqlMigrationStore'

export {
  MikroOrmMigrationRunner,
  type MikroOrmMigrationRunnerOptions,
} from './MikroOrmMigrationRunner'

export {
  StepExecutor,
  type ExecuteStepOptions,
  type ExecuteFileOptions,
  type UpgradeContext,
} from './StepExecutor'
