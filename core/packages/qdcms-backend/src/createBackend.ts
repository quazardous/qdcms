/**
 * createBackend — bootstrap helper that wires the standard qdcms
 * runtime stack: discovery → registry → storage → migration runner →
 * install all in topological order.
 *
 * Returns a `QdcmsBackend` handle the host (Express/Fastify wrapper,
 * tests, future qdcms-api-emulator) uses to talk to the live system.
 *
 * **Phase 3.a scope**: discovery + boot only. The HTTP API surface
 * (routes /api/qdcms/...) lands in Phase 3.b on top of this handle.
 */

import type { Options as MikroOrmOptions } from '@mikro-orm/core'
import {
  InMemoryComponentRegistry,
  type ComponentRegistry,
} from '@quazardous/qdcms-core/registry'
import {
  MikroOrmBackendStorage,
  MikroOrmMigrationRunner,
  SqlMigrationStore,
} from '@quazardous/qdcms-core/sql'
import {
  loadFromNodeModules,
  type DiscoveredPlugin,
  type LoadFromNodeModulesResult,
} from './loader/NodeModulesPluginLoader'
import {
  buildRouter,
  dispatch,
  type QdcmsRequest,
  type QdcmsResponse,
} from './http/index'

export interface CreateBackendOptions {
  /**
   * Absolute path to the host's root (the directory containing
   * `node_modules` where plugins live).
   */
  hostPath: string
  /**
   * MikroORM options. For SQLite use `{ driver: SqliteDriver,
   * dbName: '...' }`. For MariaDB / Postgres swap the driver +
   * dbName.
   */
  ormOptions: MikroOrmOptions
  /**
   * SQL dialect — used by the runner for hashing and dialect-aware SQL.
   * Defaults to 'sqlite' when omitted; override for mariadb / postgres.
   */
  dialect?: 'sqlite' | 'mariadb' | 'mysql' | 'postgres'
  /**
   * If true (default), runs `runner.install` for every discovered
   * plugin at boot. Set false to discover-only — useful for diagnostic
   * tools (`qdcms plugin:list`) that shouldn't side-effect the DB.
   */
  installOnBoot?: boolean
  /**
   * Optional override for the loader's discovery keyword. See
   * `loadFromNodeModules`.
   */
  discoveryKeyword?: string
}

export interface QdcmsBackend {
  registry: ComponentRegistry
  storage: MikroOrmBackendStorage
  store: SqlMigrationStore
  runner: MikroOrmMigrationRunner
  /** Plugins discovered at boot (whether installed or not). */
  discovered: DiscoveredPlugin[]
  /** Per-package errors surfaced during discovery (non-fatal). */
  loaderErrors: LoadFromNodeModulesResult['errors']
  /**
   * Framework-agnostic HTTP entry point. Consumers wrap with their
   * preferred framework (Express/Fastify/Hono/native http) or with the
   * future qdcms-api-emulator (browser fetch interceptor).
   *
   * The path is the qdcms route WITHOUT the `/api/qdcms` prefix —
   * e.g. `/plugins`, `/entity/user/abc`. The wrapper strips the
   * prefix before calling.
   */
  handle(req: QdcmsRequest): Promise<QdcmsResponse>
  /** Tear down: closes the storage connection. */
  shutdown(): Promise<void>
}

export async function createBackend(
  options: CreateBackendOptions,
): Promise<QdcmsBackend> {
  const dialect = options.dialect ?? 'sqlite'
  const installOnBoot = options.installOnBoot ?? true

  // 1. Discovery
  const { plugins, errors } = await loadFromNodeModules({
    hostPath: options.hostPath,
    keyword: options.discoveryKeyword,
  })

  // 2. Storage / store / runner stack
  const storage = new MikroOrmBackendStorage({
    ormOptions: options.ormOptions,
    entities: [],
  })
  const store = new SqlMigrationStore(storage)
  const registry = new InMemoryComponentRegistry()
  const runner = new MikroOrmMigrationRunner({
    storage,
    store,
    registry,
    dialect,
  })

  // 3. Register all discovered plugins
  for (const dp of plugins) {
    registry.register(dp.manifest)
  }

  // 4. Validate cross-plugin extensions before any DB work
  registry.validateExtensions()

  // 5. Install in topological order
  if (installOnBoot) {
    const order = registry.resolveOrder()
    for (const id of order) {
      const dp = plugins.find((p) => p.manifest.id === id)
      // pluginPath enables hint loading from <plugin>/upgrades/
      await runner.install(id, dp?.path)
    }
  }

  // Build the HTTP router once; reused by every handle() call.
  const router = buildRouter()
  const backendHandlerCtx = { registry, storage, store, runner }

  return {
    registry,
    storage,
    store,
    runner,
    discovered: plugins,
    loaderErrors: errors,
    handle: (req) => dispatch(router, backendHandlerCtx, req),
    async shutdown() {
      try {
        await storage.disconnect()
      } catch {
        // already closed
      }
    },
  }
}
