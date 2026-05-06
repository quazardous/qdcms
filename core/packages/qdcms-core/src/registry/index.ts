/**
 * @quazardous/qdcms-core/registry — public exports.
 *
 * Transitional manifest + registry layer the migration runtime consumes
 * today. Will be subsumed by the Module/Plugin contract (docs/modules.md)
 * once the Kernel lands.
 */

export {
  ComponentRegistryError,
  ComponentConflictError,
  ComponentDependencyError,
  ComponentValidationError,
} from './types'

export type {
  ComponentManifestId,
  ComponentManifestPrefix,
  ComponentManifestVersion,
  ComponentDependency,
  ComponentManifest,
  ComponentRegistryState,
  ComponentRegistryEntry,
  ComponentRegistry,
} from './types'

export {
  isValidComponentManifestId,
  isValidComponentManifestPrefix,
  isValidSemver,
  validateComponentManifest,
} from './validation'

export { InMemoryComponentRegistry } from './InMemoryComponentRegistry'
