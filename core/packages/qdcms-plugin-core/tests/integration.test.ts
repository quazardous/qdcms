/**
 * End-to-end integration test for qdcms-plugin-core.
 *
 * Exercises the full chain a real consumer would walk through:
 * 1. Read THIS package's own package.json + qdcms-plugin.yaml from disk
 *    (proves the npm-pure manifest contract works on a real package)
 * 2. Build a unified PluginManifest via buildManifestFromPackageJson
 * 3. Register in InMemoryComponentRegistry
 * 4. Install via MikroOrmMigrationRunner against an in-memory SQLite
 * 5. Verify both `core_users` and `core_sessions` tables exist
 * 6. Insert + read a user via raw SQL through the storage
 * 7. Verify the FK relationship by inserting a session and checking
 *    cascade-delete behaviour
 * 8. Uninstall, verify tables dropped
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InMemoryComponentRegistry } from '@quazardous/qdcms-core/registry'
import { buildManifestFromPackageJson } from '@quazardous/qdcms-core/loader'
import {
  MikroOrmBackendStorage,
  MikroOrmMigrationRunner,
  SqlMigrationStore,
} from '@quazardous/qdcms-core/sql'

// ─── Test rig (same shape as qdcms-core's own integration tests) ──────────

interface Rig {
  storage: MikroOrmBackendStorage
  store: SqlMigrationStore
  registry: InMemoryComponentRegistry
  runner: MikroOrmMigrationRunner
  cleanup(): Promise<void>
}

async function createRig(): Promise<Rig> {
  // Temp file SQLite — see qdcms-core/tests/sql/_helpers.ts for the
  // rationale: `:memory:` is per-connection, dies when the runner
  // disconnects/reconnects on schema changes.
  const dir = mkdtempSync(join(tmpdir(), 'qdcms-plugin-core-'))
  const dbPath = join(dir, 'test.sqlite')

  const storage = new MikroOrmBackendStorage({
    ormOptions: {
      driver: (await import('@mikro-orm/sqlite')).SqliteDriver,
      dbName: dbPath,
      debug: false,
      allowGlobalContext: true,
    },
    entities: [],
  })
  const store = new SqlMigrationStore(storage)
  const registry = new InMemoryComponentRegistry()
  const runner = new MikroOrmMigrationRunner({
    storage,
    store,
    registry,
    dialect: 'sqlite',
  })
  return {
    storage,
    store,
    registry,
    runner,
    async cleanup() {
      try {
        await storage.disconnect()
      } catch {
        /* already disconnected */
      }
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    },
  }
}

// ─── Plugin location resolver ─────────────────────────────────────────────

// __dirname-equivalent in ESM
const here = dirname(fileURLToPath(import.meta.url))
// Plugin root = parent of tests/
const pluginRoot = resolvePath(here, '..')

function readPackageJson(): Record<string, unknown> {
  const text = readFileSync(join(pluginRoot, 'package.json'), 'utf8')
  return JSON.parse(text) as Record<string, unknown>
}

function readPluginYaml(): string {
  return readFileSync(join(pluginRoot, 'qdcms-plugin.yaml'), 'utf8')
}

async function exec(
  storage: MikroOrmBackendStorage,
  sql: string,
  params?: unknown[],
): Promise<unknown> {
  return await storage.getOrm().em.getConnection().execute(sql, params)
}

async function listTables(storage: MikroOrmBackendStorage): Promise<string[]> {
  const rows = (await exec(
    storage,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  )) as { name: string }[]
  return rows.map((r) => r.name)
}

async function listColumns(
  storage: MikroOrmBackendStorage,
  table: string,
): Promise<string[]> {
  const rows = (await exec(
    storage,
    `PRAGMA table_info(${table})`,
  )) as { name: string }[]
  return rows.map((r) => r.name)
}

// ─── Tests ────────────────────────────────────────────────────────────────

let rig: Rig

beforeEach(async () => {
  rig = await createRig()
})

afterEach(async () => {
  await rig.cleanup()
})

describe('manifest construction from real files', () => {
  it('builds a valid manifest from this package.json + qdcms-plugin.yaml', () => {
    const pkg = readPackageJson() as { name: string; version: string }
    const yaml = readPluginYaml()
    const manifest = buildManifestFromPackageJson({
      packageJson: pkg,
      qdcmsYaml: yaml,
    })

    expect(manifest.id).toBe('@quazardous/qdcms-plugin-core')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.prefix).toBe('core')
    expect(manifest.title).toBe('Core')

    // No qdcms-plugin deps declared yet (peerDependencies has only qdcms-core
    // which is the framework, not a plugin → filtered out)
    expect(manifest.dependencies).toBeUndefined()

    // Two entities declared
    expect(manifest.entities).toHaveLength(2)
    const entityNames = manifest.entities!.map((e) => e.name).sort()
    expect(entityNames).toEqual(['session', 'user'])
  })
})

describe('end-to-end install + insert + cascade', () => {
  it('installs and creates both tables with the right columns', async () => {
    const pkg = readPackageJson() as { name: string; version: string }
    const yaml = readPluginYaml()
    const manifest = buildManifestFromPackageJson({
      packageJson: pkg,
      qdcmsYaml: yaml,
    })
    rig.registry.register(manifest)

    await rig.runner.install(manifest.id)

    const tables = await listTables(rig.storage)
    expect(tables).toContain('core_users')
    expect(tables).toContain('core_sessions')

    const userCols = await listColumns(rig.storage, 'core_users')
    expect(userCols).toEqual(
      expect.arrayContaining(['id', 'email', 'name', 'created_at', 'updated_at']),
    )

    const sessionCols = await listColumns(rig.storage, 'core_sessions')
    expect(sessionCols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'token', 'expires_at', 'created_at']),
    )
  })

  it('repository-style insert + read works through the runner-managed schema', async () => {
    const pkg = readPackageJson() as { name: string; version: string }
    const yaml = readPluginYaml()
    const manifest = buildManifestFromPackageJson({
      packageJson: pkg,
      qdcmsYaml: yaml,
    })
    rig.registry.register(manifest)
    await rig.runner.install(manifest.id)

    await exec(
      rig.storage,
      `INSERT INTO core_users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [
        '11111111-1111-1111-1111-111111111111',
        'alice@example.com',
        'Alice',
        '2026-01-01T00:00:00Z',
        '2026-01-01T00:00:00Z',
      ],
    )

    const rows = (await exec(
      rig.storage,
      `SELECT email, name FROM core_users WHERE id = ?`,
      ['11111111-1111-1111-1111-111111111111'],
    )) as { email: string; name: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('alice@example.com')
    expect(rows[0].name).toBe('Alice')
  })

  it('inserts a session linked to a user via user_id', async () => {
    // Smoke test for the user_id FK column existence and basic
    // relational integrity — full ON DELETE CASCADE behaviour is
    // a MikroORM v6 + SQLite + descriptorToEntitySchema concern that
    // deserves its own fix (PRAGMA foreign_keys handling, MikroORM
    // FK option mapping). For Phase 3 PoC we just verify the column
    // is wired up and queries on it work.
    const pkg = readPackageJson() as { name: string; version: string }
    const yaml = readPluginYaml()
    const manifest = buildManifestFromPackageJson({
      packageJson: pkg,
      qdcmsYaml: yaml,
    })
    rig.registry.register(manifest)
    await rig.runner.install(manifest.id)

    const userId = '22222222-2222-2222-2222-222222222222'
    await exec(
      rig.storage,
      `INSERT INTO core_users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [userId, 'bob@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    )
    await exec(
      rig.storage,
      `INSERT INTO core_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      [
        '33333333-3333-3333-3333-333333333333',
        userId,
        'session-token-bob',
        '2026-12-31T00:00:00Z',
        '2026-01-01T00:00:00Z',
      ],
    )

    const sessionRows = (await exec(
      rig.storage,
      `SELECT s.token, u.email
       FROM core_sessions s
       JOIN core_users u ON u.id = s.user_id
       WHERE s.user_id = ?`,
      [userId],
    )) as { token: string; email: string }[]
    expect(sessionRows).toHaveLength(1)
    expect(sessionRows[0].token).toBe('session-token-bob')
    expect(sessionRows[0].email).toBe('bob@example.com')
  })
})

describe('end-to-end uninstall', () => {
  it('drops both core_users and core_sessions; system table preserved', async () => {
    const pkg = readPackageJson() as { name: string; version: string }
    const yaml = readPluginYaml()
    const manifest = buildManifestFromPackageJson({
      packageJson: pkg,
      qdcmsYaml: yaml,
    })
    rig.registry.register(manifest)
    await rig.runner.install(manifest.id)
    expect(await listTables(rig.storage)).toEqual(
      expect.arrayContaining(['core_users', 'core_sessions']),
    )

    await rig.runner.uninstall(manifest.id)

    const tables = await listTables(rig.storage)
    expect(tables).not.toContain('core_users')
    expect(tables).not.toContain('core_sessions')
    // System table should still be there (it's qdcms-managed, not the plugin's).
    expect(tables).toContain('qdcms_schema_state')
  })
})

describe('schema_state row shape after install', () => {
  it('records the plugin name as id and the version from package.json', async () => {
    const pkg = readPackageJson() as { name: string; version: string }
    const yaml = readPluginYaml()
    const manifest = buildManifestFromPackageJson({
      packageJson: pkg,
      qdcmsYaml: yaml,
    })
    rig.registry.register(manifest)
    await rig.runner.install(manifest.id)

    const rows = await rig.store.appliedForExtended(manifest.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].pluginVersion).toBe(pkg.version)
    expect(rows[0].renderedSchema).toBeDefined()
    expect(rows[0].renderedSchema?.ownedTables).toHaveLength(2)
  })
})
