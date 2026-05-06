/**
 * @quazardous/qdcms-backend-server — public barrel.
 *
 * The Node-side reusable shell: an Express wrap around qdcms-
 * backend's `createBackend`, a typed config + env loader, and
 * lifecycle helpers. Instances build their server in three lines:
 *
 * ```ts
 * import { runQdcmsServer, loadConfigFromEnv, findQdcmsCore } from '@quazardous/qdcms-backend-server'
 * await runQdcmsServer(loadConfigFromEnv({ corePath: findQdcmsCore() }))
 * ```
 *
 * Public surface (this barrel) is the contract. Anything imported
 * from a deeper path is internal and may break in any release —
 * `package.json` exports map enforces it.
 */

export { runQdcmsServer } from './runQdcmsServer'
export {
  buildServer,
  type ServerHandle,
} from './buildServer'
export {
  loadConfigFromEnv,
  type QdcmsServerConfig,
  type SqlDialect,
} from './config'
export { findQdcmsCore } from './findQdcmsCore'
