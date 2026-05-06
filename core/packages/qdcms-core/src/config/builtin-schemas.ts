/**
 * config/builtin-schemas.ts — schemas for the framework
 * (`qdcms.*`) namespace.
 *
 * These are the framework's own concepts — locales, plugins,
 * etc. — declared the same way a plugin would. The compile
 * pipeline auto-registers them so an instance never needs to
 * "install" qdcms itself.
 *
 * Adding a new framework concept (e.g. `qdcms.menus` if it
 * doesn't get its own plugin) means adding an entry here and
 * documenting it in docs/config.md.
 */

import { defineConfigSchema, field, type NamespaceSchema } from './schema'

const locales = defineConfigSchema({
  namespace: 'qdcms',
  contributedBy: '@quazardous/qdcms-core',
  concepts: {
    locales: {
      shape: field.object({
        list: field.array(field.string()),
        default: field.string(),
      }),
    },
    plugins: {
      identifyBy: 'id',
      shape: field.array(
        field.object({
          id: field.string({ locked: true }),
          version: field.string(),
          prefix: field.string({ locked: true }),
          title: field.string({ optional: true, default: '' }),
          tables: field.array(field.string()),
        }),
      ),
    },
  },
})

export const builtinSchemas: NamespaceSchema[] = [locales]
