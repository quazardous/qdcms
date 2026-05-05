/**
 * createBrowserBackend — bootstrap helper for running a qdcms-backend
 * inside a browser tab. The browser counterpart to `createBackend`
 * (Node, MikroORM-backed).
 *
 * Why exists: a static-site demo can't ship a Node server, but it
 * can serve the qdcms HTTP contract from inside the browser via a
 * fetch interceptor (qdcms-api-emulator) talking to this backend.
 * Also useful in unit tests and offline-first / low-trust contexts.
 *
 * What it gives up vs. the Node `createBackend`:
 *   • No npm-based plugin discovery — caller passes `plugins` directly.
 *   • No SQL, no ORM — `MemoryStore` is a plain Map-of-Maps.
 *   • No migration runner, no DDL — schema is implied by the seed.
 *
 * What it keeps:
 *   • The qdcms HTTP contract (`/plugins`, `/schema-state`,
 *     `/entity/:name`, `/entity/:name/:id`).
 *   • The same `{ handle(req): Promise<response> }` shape as the
 *     Node backend, so consumers (qdcms-api-emulator, tests) don't
 *     care which flavour they're talking to.
 */

import type { QdcmsRequest, QdcmsResponse } from '../http/index'
import { MemoryStore } from './MemoryStore'
import { dispatchBrowser } from './routes'
import type { CreateBrowserBackendOptions } from './types'

export interface BrowserBackend {
  /** Framework-agnostic HTTP entry point. Same shape as Node `QdcmsBackend.handle`. */
  handle(req: QdcmsRequest): Promise<QdcmsResponse>
  /** Wipe the persisted snapshot — useful for "reset demo" buttons. */
  reset(): void
  /** Direct access to the underlying store (for tests / advanced use). */
  store: MemoryStore
}

export function createBrowserBackend(
  options: CreateBrowserBackendOptions,
): BrowserBackend {
  const store = new MemoryStore(options)
  const plugins = options.plugins
  return {
    store,
    async handle(req) {
      try {
        return await dispatchBrowser(req, { store, plugins })
      } catch (cause) {
        return {
          status: 500,
          body: {
            error: 'INTERNAL',
            message: (cause as Error).message,
          },
        }
      }
    },
    reset() {
      store.reset()
    },
  }
}
