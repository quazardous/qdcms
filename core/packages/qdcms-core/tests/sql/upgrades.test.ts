/**
 * Integration tests — plugin upgrades with author hints.
 *
 * Each test sets up a fake plugin directory with `qdcms-plugin.yaml`
 * (we just simulate the manifest in-memory) and `upgrades/<v>.yaml`
 * files on disk, then runs the runner end-to-end.
 *
 * Coverage:
 * - rename_field: data preserved across rename
 * - add_field with backfill_from
 * - add_field with backfill_default literal
 * - drop_field: column gone, others intact
 * - min_version block: too-old install is refused
 * - skip-version upgrade: all intermediate hints applied
 * - downgrade refused
 * - no upgrades dir → falls back to structural diff (no warning crashes)
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestRig,
  exec,
  listColumns,
  makeFakePlugin,
  type TestRig,
} from './_helpers'
import { UpgradeMinVersionError } from '../../src/migration/hints'

let rig: TestRig
let pluginDir: string

beforeEach(async () => {
  rig = await createTestRig()
  pluginDir = mkdtempSync(join(tmpdir(), 'qdcms-plugin-'))
})

afterEach(async () => {
  await rig.cleanup()
  try {
    rmSync(pluginDir, { recursive: true, force: true })
  } catch {
    // best effort
  }
})

function writeUpgrade(version: string, yamlBody: string): void {
  mkdirSync(join(pluginDir, 'upgrades'), { recursive: true })
  writeFileSync(join(pluginDir, 'upgrades', `${version}.yaml`), yamlBody, 'utf8')
}

describe('rename_field with data preservation', () => {
  it('renames column and keeps existing rows', async () => {
    // Step 1: install plugin v1.0.0 with field "title"
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              title: { type: 'string', length: 255 },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)
    await exec(rig.storage, `INSERT INTO dc_posts (id, title) VALUES (1, 'hello')`)

    // Step 2: prepare upgrade hint
    writeUpgrade(
      '2.0.0',
      `description: Rename title to headline
steps:
  - rename_field: { entity: post, from: title, to: headline }
`,
    )

    // Step 3: re-register plugin at v2.0.0 with the new field name and upgrade
    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '2.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              headline: { type: 'string', length: 255 },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    // Verify column renamed and data preserved
    const cols = await listColumns(rig.storage, 'dc_posts')
    expect(cols).toContain('headline')
    expect(cols).not.toContain('title')

    const rows = (await exec(
      rig.storage,
      `SELECT id, headline FROM dc_posts WHERE id = 1`,
    )) as { id: number; headline: string }[]
    expect(rows[0].headline).toBe('hello')
  })
})

describe('add_field with backfill_from', () => {
  it('adds a column and copies values from another column', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              old_author: { type: 'string', length: 64 },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)
    await exec(rig.storage, `INSERT INTO dc_posts (id, old_author) VALUES (1, 'alice')`)

    writeUpgrade(
      '1.1.0',
      `steps:
  - add_field:
      entity: post
      field: author
      backfill_from: old_author
`,
    )

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.1.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              old_author: { type: 'string', length: 64 },
              author: { type: 'string', length: 64, nullable: true },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    const rows = (await exec(
      rig.storage,
      `SELECT id, author FROM dc_posts WHERE id = 1`,
    )) as { id: number; author: string }[]
    expect(rows[0].author).toBe('alice')
  })
})

describe('add_field with backfill_default literal', () => {
  it('uses the literal default for existing rows', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)
    await exec(rig.storage, `INSERT INTO dc_posts (id) VALUES (1)`)

    writeUpgrade(
      '1.1.0',
      `steps:
  - add_field:
      entity: post
      field: status
      backfill_default: 'draft'
`,
    )

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.1.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              status: { type: 'string', length: 16, nullable: true },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    const rows = (await exec(
      rig.storage,
      `SELECT status FROM dc_posts WHERE id = 1`,
    )) as { status: string }[]
    expect(rows[0].status).toBe('draft')
  })
})

describe('drop_field', () => {
  it('drops the column declared in the hint, others intact', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              keep: { type: 'string', length: 64 },
              legacy: { type: 'integer' },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)
    await exec(rig.storage, `INSERT INTO dc_posts (id, keep, legacy) VALUES (1, 'k', 42)`)

    writeUpgrade(
      '1.1.0',
      `steps:
  - drop_field: { entity: post, field: legacy }
`,
    )

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.1.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              keep: { type: 'string', length: 64 },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    const cols = await listColumns(rig.storage, 'dc_posts')
    expect(cols).not.toContain('legacy')
    expect(cols).toContain('keep')
    const rows = (await exec(
      rig.storage,
      `SELECT id, keep FROM dc_posts WHERE id = 1`,
    )) as { id: number; keep: string }[]
    expect(rows[0].keep).toBe('k')
  })
})

describe('min_version safety guard', () => {
  it('refuses to apply when current version is below min_version', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    writeUpgrade(
      '2.0.0',
      `min_version: '1.5.0'
steps:
  - drop_field: { entity: post, field: legacy }
`,
    )

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '2.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await expect(rig.runner.install('dc', pluginDir)).rejects.toThrow(
      UpgradeMinVersionError,
    )
  })

  it('accepts when current version satisfies min_version (via intermediate file)', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    // Two files: 1.5.0.yaml (no min_version) advances state, then
    // 2.0.0.yaml requires 1.5.0+ (satisfied after the first one).
    // Note: `marker` field is added in 1.5 then dropped in 2.0 — it
    // never appears in the manifest, so the add_field step must carry
    // `type` explicitly (hint self-containment).
    writeUpgrade(
      '1.5.0',
      `steps:
  - add_field: { entity: post, field: marker, type: integer, backfill_default: 1 }
`,
    )
    writeUpgrade(
      '2.0.0',
      `min_version: '1.5.0'
steps:
  - drop_field: { entity: post, field: marker }
`,
    )

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '2.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await expect(rig.runner.install('dc', pluginDir)).resolves.toBeDefined()
    const cols = await listColumns(rig.storage, 'dc_posts')
    expect(cols).not.toContain('marker')
  })
})

describe('downgrade refusal', () => {
  it('refuses to install a version below the recorded one', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '2.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await expect(rig.runner.install('dc', pluginDir)).rejects.toThrow(
      /downgrade not supported/,
    )
  })
})

describe('no upgrades directory', () => {
  it('falls back to structural diff with no errors', async () => {
    // Don't write any upgrades/ — pluginDir stays empty
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await expect(rig.runner.install('dc', pluginDir)).resolves.toBeDefined()
    expect(await listColumns(rig.storage, 'dc_posts')).toContain('id')
  })
})

describe('schema_state extended columns', () => {
  it('records plugin_version + upgrade_file + applied_sql for each step in chain', async () => {
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.0.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: { id: { type: 'integer', pk: true } },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    writeUpgrade(
      '1.1.0',
      `steps:
  - add_field: { entity: post, field: tag, backfill_default: 'x' }
`,
    )

    rig.registry.unregister('dc')
    rig.registry.register(
      makeFakePlugin({
        id: 'dc',
        version: '1.1.0',
        entities: [
          {
            name: 'post',
            tableName: 'posts',
            fields: {
              id: { type: 'integer', pk: true },
              tag: { type: 'string', length: 16, nullable: true },
            },
          },
        ],
      }),
    )
    await rig.runner.install('dc', pluginDir)

    const rows = await rig.store.appliedForExtended('dc')
    // Should have at least two rows: initial install + the 1.1.0 hint
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const hintRow = rows.find((r) => r.upgradeFile === '1.1.0.yaml')
    expect(hintRow).toBeDefined()
    expect(hintRow!.pluginVersion).toBe('1.1.0')
    expect(hintRow!.appliedSql).toContain('ADD COLUMN tag')
  })
})
