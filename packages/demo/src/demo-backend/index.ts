/**
 * createDemoBackend — pseudo backend for the demo.
 *
 * Lives only in the demo, exists only because the demo deploys to
 * a static host and needs SOMETHING to answer /api/qdcms/* requests.
 * Honours the qdcms HTTP contract just enough for blocks to use
 * ApiFrontendStorage as if a real Node server existed.
 *
 * Wire it to qdcms-api-emulator:
 *
 *   const backend = createDemoBackend({
 *     plugins: [{ id: '@quazardous/qdcms-plugin-core', version: '0.1.0',
 *                 prefix: 'core', tables: ['user', 'session'] }],
 *     seed: { user: [{ id: 'u1', email: 'demo@example.com', name: 'Demo' }] },
 *   })
 *   installEmulator({ backend })
 */

import type {
  QdcmsRequest,
  QdcmsResponse,
} from '@quazardous/qdcms-backend/http'
import { dispatchDemo } from './routes'
import { DemoStore } from './storage'
import type { CreateDemoBackendOptions } from './types'

export interface DemoBackend {
  handle(req: QdcmsRequest): Promise<QdcmsResponse>
  /** Wipes the in-memory + persisted snapshot — useful for "reset demo" buttons. */
  reset(): void
}

export function createDemoBackend(options: CreateDemoBackendOptions): DemoBackend {
  const store = new DemoStore(options)
  const plugins = options.plugins
  return {
    async handle(req) {
      try {
        return await dispatchDemo(req, { store, plugins })
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
      const ws =
        options.persist === 'sessionStorage'
          ? globalThis.sessionStorage
          : globalThis.localStorage
      try {
        ws?.removeItem(options.storageKey ?? 'qdcms-demo-backend')
      } catch {
        /* ignore */
      }
    },
  }
}

export type { CreateDemoBackendOptions, DemoPlugin, DemoSeed } from './types'
