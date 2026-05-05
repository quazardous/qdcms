/**
 * qdcms.config.ts — business layer.
 *
 * BUSINESS, not infra. This file answers "what is this app about?":
 * which plugins ship with it, what content seeds it, how it talks to
 * its backend. It does NOT decide how the app boots, nor what the
 * bundle contains — that's `main.ts` / `bootstrap.ts`'s job.
 *
 * Declarative and runtime-agnostic on purpose. Keep it free of Vue,
 * of `node:*` imports, and of any code that only runs in the main
 * thread — it has to stay portable to a future Web Worker / SSR
 * runtime that consumes the same config.
 *
 * Two backend modes are supported out of the box:
 *   • 'browser' — fake backend running in this tab (POC default)
 *   • 'remote'  — real HTTP backend at `VITE_QDCMS_API_URL`
 *
 * The active mode is driven by `VITE_QDCMS_BACKEND_MODE`. See
 * `.env.example` for the variable list.
 */

import type { QdcmsAppConfig } from './bootstrap'
import { realizationSeed } from './data/realizations'

const mode = (import.meta.env.VITE_QDCMS_BACKEND_MODE ?? 'browser') as
  | 'browser'
  | 'remote'

const config: QdcmsAppConfig = {
  backend:
    mode === 'remote'
      ? {
          mode: 'remote',
          url: import.meta.env.VITE_QDCMS_API_URL ?? '/api/qdcms',
        }
      : {
          mode: 'browser',
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
            // Demo-only "plugin" exposing the realization entity that
            // the portfolio blocks consume. In a real deployment this
            // would be a proper qdcms plugin npm package.
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
        },
}

export default config
