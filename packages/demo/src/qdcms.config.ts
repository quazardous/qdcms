/**
 * qdcms.config.ts — business layer.
 *
 * BUSINESS, not infra. This file answers "what is this app about?":
 * which plugins ship with it, what content seeds it. It does NOT
 * decide how the app boots, what the bundle contains, nor whether
 * the backend runs in-tab or on a real server — that's `main.ts` /
 * `bootstrap.ts` / `install-demo-backend.ts`'s job.
 *
 * Declarative and runtime-agnostic on purpose. Keep it free of Vue,
 * of `node:*` imports, and of any code that only runs in the main
 * thread — it has to stay portable to a future Web Worker / SSR /
 * Node-server runtime that consumes the same config.
 *
 * In classic-backend mode (real Node server), `plugins` and `seed`
 * are typically ignored on the SPA side — the server has its own
 * authoritative source of truth.
 */

import type { BrowserPlugin, BrowserSeed } from '@quazardous/qdcms-backend/browser'
import { realizationSeed } from './data/realizations'

export interface QdcmsAppConfig {
  /**
   * Plugins shipped with the app. Used by the in-tab demo backend
   * to expose `/plugins` and to derive table names. Ignored when
   * running against a real Node server.
   */
  plugins: BrowserPlugin[]
  /**
   * Initial rows per logical entity name. Same caveat as `plugins` —
   * only consumed by the in-tab demo backend.
   */
  seed: BrowserSeed
}

const config: QdcmsAppConfig = {
  // Static plugin set for the demo. In a real qdcms install a
  // registry table drives this; for the POC we keep it inline.
  plugins: [
    {
      id: '@quazardous/qdcms-plugin-core',
      version: '0.1.0',
      prefix: 'core',
      title: 'Core',
      tables: ['user', 'session'],
    },
    // Demo-only "plugin" exposing the realization entity that the
    // portfolio blocks consume. In a real deployment this would be
    // a proper qdcms plugin npm package.
    {
      id: 'demo',
      version: '0.1.0',
      prefix: 'demo',
      title: 'Demo content',
      tables: ['realization'],
    },
  ],
  seed: {
    user: [
      {
        id: 'demo-user-1',
        email: 'alice@flowercraft.demo',
        name: 'Alice',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    realization: realizationSeed,
  },
}

export default config
