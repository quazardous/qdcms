/**
 * Schema composer — turns a set of component manifests into per-manifest
 * `ComposedSchema` objects ready for hashing and feeding the diff engine.
 *
 * Responsibilities:
 * - Apply the manifest's `prefix_` to each entity's tableName (idempotent)
 * - Stamp `owner = componentId` on every field, index, entity
 * - For each `extension`, attach the foreign table's owner and
 *   stamp the extending manifest as the column owner
 * - Detect column-name collisions (two manifests adding the same column
 *   to the same foreign table)
 *
 * What this does NOT do:
 * - Render templates (the host pipeline does YAML render before calling here)
 * - Diff against current DB state (that's the runner's job, via MikroORM)
 */

import type { EntityDescriptor } from '../entity/types'
import type { ComponentManifest } from '../registry/types'
import { MigrationOwnershipError, type ComposedSchema } from './types'

/**
 * Compose one manifest's contribution. Pure transformation — no I/O, no DB.
 */
export function composePluginSchema(manifest: ComponentManifest): ComposedSchema {
  const ownedTables = (manifest.entities ?? []).map((e) =>
    stampOwnedEntity(e, manifest),
  )
  const extensions: ComposedSchema['extensions'] = {}
  for (const [tableName, fields] of Object.entries(manifest.extensions ?? {})) {
    extensions[tableName] = stampOwnedFields(fields, manifest.id)
  }
  return { ownedTables, extensions }
}

/**
 * Compose ALL active manifests into a single virtual `DatabaseSchema`-shaped
 * map. This is what the diff engine consumes to compute a global update.
 *
 * Throws `MigrationOwnershipError` on column conflicts (two manifests
 * adding the same column to the same table).
 *
 * Returns a flat map: physical table name → entity descriptor with merged
 * fields. Owned-table fields keep their original owner (the table's
 * manifest); extension fields keep the extending manifest's owner.
 */
export function composeFullSchema(
  manifests: ComponentManifest[],
): Record<string, EntityDescriptor> {
  const tables: Record<string, EntityDescriptor> = {}

  // First pass: place all owned tables.
  for (const m of manifests) {
    for (const ent of composePluginSchema(m).ownedTables) {
      if (tables[ent.tableName]) {
        throw new MigrationOwnershipError(
          `table "${ent.tableName}" claimed by both "${tables[ent.tableName].owner}" and "${m.id}"`,
          m.id,
        )
      }
      tables[ent.tableName] = ent
    }
  }

  // Second pass: merge extensions.
  for (const m of manifests) {
    const composed = composePluginSchema(m)
    for (const [tableName, fields] of Object.entries(composed.extensions)) {
      const target = tables[tableName]
      if (!target) {
        throw new MigrationOwnershipError(
          `plugin "${m.id}" extends unknown table "${tableName}"`,
          m.id,
        )
      }
      for (const [fieldName, config] of Object.entries(fields)) {
        if (target.fields[fieldName]) {
          const existing = target.fields[fieldName]
          throw new MigrationOwnershipError(
            `column "${tableName}.${fieldName}" claimed by both "${existing.owner ?? target.owner}" and "${m.id}"`,
            m.id,
          )
        }
        target.fields[fieldName] = config
      }
    }
  }

  return tables
}

// ─── internals ────────────────────────────────────────────────────────────

function stampOwnedEntity(
  entity: EntityDescriptor,
  manifest: ComponentManifest,
): EntityDescriptor {
  const physicalName = entity.tableName.startsWith(`${manifest.prefix}_`)
    ? entity.tableName
    : `${manifest.prefix}_${entity.tableName}`

  return {
    name: entity.name,
    tableName: physicalName,
    owner: manifest.id,
    fields: stampOwnedFields(entity.fields, manifest.id),
    indexes: (entity.indexes ?? []).map((i) => ({ ...i, owner: manifest.id })),
  }
}

function stampOwnedFields(
  fields: EntityDescriptor['fields'],
  ownerId: string,
): EntityDescriptor['fields'] {
  const out: EntityDescriptor['fields'] = {}
  for (const [name, config] of Object.entries(fields)) {
    out[name] = { ...config, owner: ownerId }
  }
  return out
}
