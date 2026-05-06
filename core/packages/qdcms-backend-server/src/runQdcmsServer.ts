/**
 * runQdcmsServer — opinionated one-liner entry for hosts.
 *
 * Build the server, start it, register graceful shutdown on
 * SIGINT / SIGTERM, return the handle. This is what an instance's
 * thin `server.ts` calls — three lines including the import.
 *
 * If you need finer control (custom routes, multiple HTTP
 * frameworks, a test that doesn't bind a port), call
 * `buildServer(config)` directly and own the lifecycle yourself.
 */

import { buildServer, type ServerHandle } from './buildServer'
import type { QdcmsServerConfig } from './config'

export async function runQdcmsServer(
  config: QdcmsServerConfig,
): Promise<ServerHandle> {
  const handle = await buildServer(config)
  await handle.start()

  // Graceful shutdown — Ctrl-C, container stop, etc.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, async () => {
      // eslint-disable-next-line no-console
      console.log(`[qdcms-backend-server] ${sig} — shutting down…`)
      await handle.stop()
      process.exit(0)
    })
  }

  return handle
}
