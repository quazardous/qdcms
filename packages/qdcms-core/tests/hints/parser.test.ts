/**
 * parseUpgradeFile — pure-function tests.
 *
 * Coverage focus: top-level shape, each step kind, error path-prefixed messages.
 */

import { describe, expect, it } from 'vitest'
import {
  parseUpgradeFile,
  UpgradeFileError,
} from '../../src/migration/hints'

const baseInput = (content: string) => ({
  content,
  filePath: 'plugins/dc/upgrades/2.0.0.yaml',
  targetVersion: '2.0.0',
})

describe('parseUpgradeFile — top-level', () => {
  it('parses a minimal valid file', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - rename_field:
      entity: posts
      from: title
      to: headline
`),
    )
    expect(f.targetVersion).toBe('2.0.0')
    expect(f.filePath).toBe('plugins/dc/upgrades/2.0.0.yaml')
    expect(f.steps).toHaveLength(1)
    expect(f.minVersion).toBeUndefined()
    expect(f.description).toBeUndefined()
  })

  it('captures description and min_version', () => {
    const f = parseUpgradeFile(
      baseInput(`
description: Upgrade to v2 — renames title.
min_version: 1.5.0
steps:
  - rename_field: { entity: posts, from: title, to: headline }
`),
    )
    expect(f.description).toBe('Upgrade to v2 — renames title.')
    expect(f.minVersion).toBe('1.5.0')
  })

  it('rejects invalid target version', () => {
    expect(() =>
      parseUpgradeFile({
        content: 'steps:\n  - drop_field: { entity: x, field: y }',
        filePath: 'foo.yaml',
        targetVersion: 'wat',
      }),
    ).toThrow(/not valid semver/)
  })

  it('rejects empty content', () => {
    expect(() => parseUpgradeFile(baseInput(''))).toThrow(UpgradeFileError)
  })

  it('rejects non-mapping top-level', () => {
    expect(() => parseUpgradeFile(baseInput('- foo\n- bar'))).toThrow(/must be a YAML mapping/)
  })

  it('rejects missing steps', () => {
    expect(() => parseUpgradeFile(baseInput('description: foo'))).toThrow(/steps is required/)
  })

  it('rejects non-array steps', () => {
    expect(() => parseUpgradeFile(baseInput('steps: foo'))).toThrow(/steps must be an array/)
  })

  it('rejects empty steps array', () => {
    expect(() => parseUpgradeFile(baseInput('steps: []'))).toThrow(/steps array is empty/)
  })

  it('rejects min_version that is not valid semver', () => {
    expect(() =>
      parseUpgradeFile(baseInput('min_version: "wat"\nsteps:\n  - drop_field: { entity: x, field: y }')),
    ).toThrow(/min_version "wat" is not valid semver/)
  })

  it('rejects min_version that is not a string', () => {
    expect(() =>
      parseUpgradeFile(baseInput('min_version: 42\nsteps:\n  - drop_field: { entity: x, field: y }')),
    ).toThrow(/min_version must be a string/)
  })
})

describe('parseUpgradeFile — step types', () => {
  it('rename_field full shape', () => {
    const f = parseUpgradeFile(
      baseInput('steps:\n  - rename_field: { entity: posts, from: title, to: headline }'),
    )
    expect(f.steps[0]).toEqual({
      kind: 'rename_field',
      entity: 'posts',
      from: 'title',
      to: 'headline',
    })
  })

  it('add_field with backfill_from', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - add_field:
      entity: posts
      field: author_id
      backfill_from: legacy_author_id
`),
    )
    expect(f.steps[0]).toEqual({
      kind: 'add_field',
      entity: 'posts',
      field: 'author_id',
      backfill_from: 'legacy_author_id',
      backfill_default: undefined,
      backfill_sql: undefined,
    })
  })

  it('add_field with backfill_default literal', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - add_field:
      entity: posts
      field: published
      backfill_default: false
`),
    )
    const step = f.steps[0]
    if (step.kind !== 'add_field') throw new Error('expected add_field step')
    expect(step.backfill_default).toBe(false)
  })

  it('add_field with backfill_sql', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - add_field:
      entity: posts
      field: read_time
      backfill_sql: 'LENGTH(body) / 1000'
`),
    )
    const step = f.steps[0]
    if (step.kind !== 'add_field') throw new Error('expected add_field step')
    expect(step.backfill_sql).toBe('LENGTH(body) / 1000')
  })

  it('drop_field', () => {
    const f = parseUpgradeFile(
      baseInput('steps:\n  - drop_field: { entity: posts, field: legacy_count }'),
    )
    expect(f.steps[0]).toEqual({
      kind: 'drop_field',
      entity: 'posts',
      field: 'legacy_count',
    })
  })

  it('rename_table', () => {
    const f = parseUpgradeFile(
      baseInput('steps:\n  - rename_table: { from: old_t, to: new_t }'),
    )
    expect(f.steps[0]).toEqual({ kind: 'rename_table', from: 'old_t', to: 'new_t' })
  })

  it('change_type with cast', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - change_type:
      entity: posts
      field: views
      cast: 'CAST(views AS BIGINT)'
`),
    )
    expect(f.steps[0]).toEqual({
      kind: 'change_type',
      entity: 'posts',
      field: 'views',
      cast: 'CAST(views AS BIGINT)',
    })
  })

  it('add_index unique', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - add_index:
      entity: posts
      fields: [slug]
      unique: true
`),
    )
    expect(f.steps[0]).toEqual({
      kind: 'add_index',
      entity: 'posts',
      fields: ['slug'],
      unique: true,
      name: undefined,
    })
  })

  it('drop_index', () => {
    const f = parseUpgradeFile(
      baseInput('steps:\n  - drop_index: { entity: posts, name: idx_legacy }'),
    )
    expect(f.steps[0]).toEqual({
      kind: 'drop_index',
      entity: 'posts',
      name: 'idx_legacy',
    })
  })

  it('script with description', () => {
    const f = parseUpgradeFile(
      baseInput(`
steps:
  - script: ./helpers/split-tags.ts
    description: Extract embedded tags
`),
    )
    expect(f.steps[0]).toEqual({
      kind: 'script',
      script: './helpers/split-tags.ts',
      description: 'Extract embedded tags',
    })
  })
})

describe('parseUpgradeFile — error paths', () => {
  it('rejects unknown step kind', () => {
    expect(() =>
      parseUpgradeFile(baseInput('steps:\n  - frobnicate: { x: y }')),
    ).toThrow(/no recognised step kind/)
  })

  it('rejects step that is an array', () => {
    expect(() =>
      parseUpgradeFile(baseInput('steps:\n  - [foo, bar]')),
    ).toThrow(/must be a mapping with one key/)
  })

  it('rejects rename_field with missing from', () => {
    expect(() =>
      parseUpgradeFile(
        baseInput('steps:\n  - rename_field: { entity: x, to: y }'),
      ),
    ).toThrow(/rename_field\.from must be a non-empty string/)
  })

  it('rejects add_field with missing field', () => {
    expect(() =>
      parseUpgradeFile(baseInput('steps:\n  - add_field: { entity: x }')),
    ).toThrow(/add_field\.field must be a non-empty string/)
  })

  it('rejects add_index with non-string field entry', () => {
    expect(() =>
      parseUpgradeFile(
        baseInput('steps:\n  - add_index: { entity: x, fields: [foo, 42] }'),
      ),
    ).toThrow(/add_index\.fields must be a non-empty array of strings/)
  })

  it('rejects malformed YAML', () => {
    expect(() =>
      parseUpgradeFile(baseInput('steps: [\n  - bad')),
    ).toThrow(/failed to parse YAML/)
  })
})
