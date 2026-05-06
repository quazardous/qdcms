/**
 * @quazardous/qdcms-core/plugin — public exports.
 *
 * The Plugin contract for npm-distributed qdcms plugins. See
 * `docs/modules.md` for the design.
 */

export type { Plugin } from './types'

export {
  PluginSchema,
  PluginValidationError,
  validatePlugin,
} from './schema'
