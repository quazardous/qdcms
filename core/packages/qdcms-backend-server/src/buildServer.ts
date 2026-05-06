/**
 * buildServer.ts — wiring engine.
 *
 * Turns a `QdcmsServerConfig` into a running HTTP server. This is
 * where the backend's "small world" is assembled : DB connection,
 * plugin discovery, migration runner, HTTP framework.
 *
 * Returns a handle the caller can `start()` / `stop()`. The handle
 * also exposes the underlying `QdcmsBackend` so a test harness can
 * poke it directly without going through HTTP.
 *
 * Pair this with `runQdcmsServer` for the one-liner host case ;
 * call `buildServer` directly when you need finer control (custom
 * routes, multiple HTTP frameworks, tests that don't bind a port).
 */

import express, { type Express } from 'express'
import http from 'node:http'
import { SqliteDriver } from '@mikro-orm/sqlite'
import {
  createBackend,
  type QdcmsBackend,
} from '@quazardous/qdcms-backend'
import type { QdcmsServerConfig } from './config'
import { mountQdcmsRoutes } from './http'

export interface ServerHandle {
  /** Express app — exposed for tests, route additions, etc. */
  app: Express
  /** Underlying qdcms backend handle — exposed for direct calls. */
  backend: QdcmsBackend
  /** Active HTTP server once `start()` has been called. */
  httpServer: http.Server | null
  /** Bind to the configured port. Resolves once the socket is listening. */
  start(): Promise<void>
  /** Close the HTTP socket and shut down the backend (DB connections). */
  stop(): Promise<void>
}

/**
 * Build everything : discover plugins, open the DB, run migrations,
 * wire Express. Doesn't bind to a port yet — call `handle.start()`.
 */
export async function buildServer(config: QdcmsServerConfig): Promise<ServerHandle> {
  // 1. Build the qdcms backend (plugin discovery + storage + migrations).
  const backend = await createBackend({
    hostPath: config.corePath,
    ormOptions: {
      driver: SqliteDriver,
      dbName: config.dbName,
      // Quiet the driver in dev — qdcms-backend has its own logging.
      debug: false,
    },
    dialect: config.dialect,
    installOnBoot: config.installOnBoot,
  })

  if (backend.loaderErrors.length > 0) {
    // Non-fatal but worth knowing — surface as a structured log.
    console.warn(
      `[qdcms-backend-server] plugin loader had ${backend.loaderErrors.length} non-fatal errors:`,
      backend.loaderErrors,
    )
  }
  console.log(
    `[qdcms-backend-server] discovered ${backend.discovered.length} plugin(s):`,
    backend.discovered.map((p) => p.manifest.id).join(', ') || '(none)',
  )

  // 2. Express setup. Body parsing for JSON; everything else stays
  //    minimal — the qdcms HTTP contract is JSON-only.
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.disable('x-powered-by')

  // 3. Mount the qdcms routes under /api/qdcms/*.
  mountQdcmsRoutes(app, backend)

  // 4. Health probe — useful for the proxy / smoke-tests.
  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      plugins: backend.discovered.map((p) => p.manifest.id),
    })
  })

  // 5. Build a stoppable handle.
  let httpServer: http.Server | null = null
  return {
    app,
    backend,
    get httpServer() {
      return httpServer
    },
    async start() {
      await new Promise<void>((resolve, reject) => {
        httpServer = app.listen(config.port, () => {
          console.log(
            `[qdcms-backend-server] listening on http://localhost:${config.port} (db=${config.dbName})`,
          )
          resolve()
        })
        httpServer.once('error', reject)
      })
    },
    async stop() {
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer!.close(() => resolve())
        })
        httpServer = null
      }
      await backend.shutdown()
    },
  }
}
