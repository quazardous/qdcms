/**
 * server.ts — Flower Craft demo Node server.
 *
 * Thin instance entry. The reusable shell does the actual work :
 *  - reads env into `QdcmsServerConfig`,
 *  - discovers plugins under `<corePath>/node_modules/`,
 *  - opens the DB, runs migrations,
 *  - mounts `/api/qdcms/*` on Express,
 *  - registers SIGINT / SIGTERM graceful shutdown.
 *
 * `findQdcmsCore()` walks up from `process.cwd()` until it finds a
 * `node_modules` folder — the qdcms repo (the "core") sits at that
 * level in all three supported layouts (monorepo dev / vendored
 * sub-folder / shared install). Override with `QDCMS_CORE=/abs/path`
 * when deploying somewhere with a non-conventional layout.
 */

import {
  findQdcmsCore,
  loadConfigFromEnv,
  runQdcmsServer,
} from '@quazardous/qdcms-backend-server'

await runQdcmsServer(loadConfigFromEnv({ corePath: findQdcmsCore() }))
