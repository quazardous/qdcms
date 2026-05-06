/**
 * @quazardous/qdcms-backend
 *
 * Backend runtime for qdcms-aware sites. Wraps qdcms-core's plugin
 * lifecycle + migration runner with npm-based plugin discovery and
 * (Phase 3.b) an HTTP API surface.
 *
 * Subpath exports:
 *   .            createBackend bootstrap helper
 *   ./loader     NodeModulesPluginLoader (low-level discovery)
 */

export {
  createBackend,
  type CreateBackendOptions,
  type QdcmsBackend,
} from './createBackend'

export * from './loader/index'
export * from './http/index'
