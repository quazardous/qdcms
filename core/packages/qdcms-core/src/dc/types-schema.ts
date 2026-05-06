/**
 * DC config schema — the `dc.types` namespace concepts that an
 * instance authors at compile-time + the admin can edit at runtime
 * (override layer, slice C9).
 *
 * **Slice M7 scope** : minimal skeleton so the Kernel topology
 * exercises a second module's `configSchemas`. The full DC type
 * declaration shape (URL pattern templates, default layout, field
 * collection, localisation flags, restricted-field permissions) lands
 * in subsequent slices alongside the per-type table-per-type runtime.
 */

import { defineConfigSchema, field, type NamespaceSchema } from '../config/schema'

/**
 * `dc.types` — the catalogue of DC types active for this instance.
 * Each entry declares one content type (e.g. `realization`, `story`).
 *
 * Today the schema is bare-bones : id + label. Slice M7+ adds
 * `urlPatternTemplate`, `layout`, `fields`, etc.
 */
const dcTypes = defineConfigSchema({
  namespace: 'dc',
  contributedBy: '@quazardous/qdcms-core',
  concepts: {
    types: {
      identifyBy: 'id',
      shape: field.array(
        field.object({
          id: field.string({ locked: true }),
          label: field.string(),
        }),
      ),
    },
  },
})

export const dcConfigSchemas: readonly NamespaceSchema[] = [dcTypes]
