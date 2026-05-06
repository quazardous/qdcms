/**
 * install-demo-backend.ts — the BRIDGE between an in-tab qdcms-backend
 * and the SPA's fetch calls. Demo-only.
 *
 * This is the ONLY place where "running a backend in a browser" is
 * wired:
 *   1. `createBrowserBackend` instantiates the in-tab qdcms-backend
 *      (Map-of-Maps storage, JSON-persisted in localStorage).
 *   2. `installEmulator` monkey-patches `globalThis.fetch` so any
 *      call to `/api/qdcms/*` is routed to the in-tab backend
 *      instead of going to a network server.
 *
 * Side-effect import. Pulled (or not) from `main.ts` — comment the
 * line in main.ts to switch to classic-backend mode (real Node
 * server). When commented, this file and its dep graph
 * (qdcms-backend/browser, qdcms-api-emulator, plugins, seed) are
 * dropped from the bundle entirely by Vite.
 */

import { createBrowserBackend } from '@quazardous/qdcms-backend/browser'
import { installEmulator } from '@quazardous/qdcms-api-emulator'
import { plugins, seed } from '../config'

const backend = createBrowserBackend({
  plugins,
  seed,
  persist: 'localStorage',
})

installEmulator({ backend })
