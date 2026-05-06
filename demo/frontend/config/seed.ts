/**
 * config/seed.ts — initial rows for the in-tab (browser) backend.
 *
 * Only consumed when `VITE_QDCMS_BACKEND_MODE=browser` ; the
 * classic Node backend has its own DB and ignores this file.
 *
 * Per §6.6 this is a hybrid : the static demo content (users,
 * realizations) lives here, but in production a DC plugin (Axis 2)
 * would supply its own seeds. Keep this file thin — long content
 * arrays belong in `content/` (e.g. `content/realizations.ts`).
 */

import type { BrowserSeed } from '@quazardous/qdcms-backend/browser'
import { realizationSeed } from '../content/realizations'

export const seed: BrowserSeed = {
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
}
