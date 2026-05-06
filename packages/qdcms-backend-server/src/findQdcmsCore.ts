/**
 * findQdcmsCore — locate the qdcms repo (the "core") at runtime.
 *
 * In the qdcms model an instance and the qdcms repo are two
 * separate worlds :
 *
 *   ┌──────────────┐         ┌──────────────────────┐
 *   │  instance/   │  ──→    │  QDCMS_CORE = qdcms  │
 *   │  (bespoke)   │         │  (packages, plugins) │
 *   └──────────────┘         └──────────────────────┘
 *
 * The core's physical location is configurable :
 *   - monorepo dev      : `..` (instance is a sub-folder of the repo)
 *   - vendored install  : `./core` (repo copy beside instance)
 *   - shared install    : `/opt/qdcms` (one repo for many instances)
 *
 * The plugin loader walks `<QDCMS_CORE>/node_modules/` to discover
 * packages keyworded `qdcms-plugin`. Most consumers don't want to
 * hardcode an absolute path. This helper walks up from the current
 * working directory until it finds a `node_modules` folder and
 * returns that directory — works for the three layouts above out
 * of the box.
 *
 * The `QDCMS_CORE` env var always wins when set ; `findQdcmsCore`
 * is the *fallback* used by `loadConfigFromEnv` when the env is
 * unset.
 *
 * Usage :
 *
 * ```ts
 * import { runQdcmsServer, loadConfigFromEnv, findQdcmsCore } from '@quazardous/qdcms-backend-server'
 * await runQdcmsServer(loadConfigFromEnv({ corePath: findQdcmsCore() }))
 * ```
 */

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export function findQdcmsCore(start: string = process.cwd()): string {
  let dir = resolve(start)
  while (true) {
    if (existsSync(resolve(dir, 'node_modules'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        `[qdcms-backend-server] findQdcmsCore: walked up from ${start} ` +
          `and found no node_modules. Set QDCMS_CORE explicitly to point ` +
          `at the qdcms repo (the directory whose node_modules holds the ` +
          `qdcms plugins).`,
      )
    }
    dir = parent
  }
}
