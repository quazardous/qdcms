/**
 * admin/register.ts — side-effect module wiring an admin zone into
 * the demo's shared CMS instance and router.
 *
 * Imported from `main.ts` when Option B (front + admin in one bundle)
 * is active. After this module's body runs:
 *   • `cms` knows the admin blocks and where to place them.
 *   • `router` exposes locale-prefixed admin routes — `/en/admin`,
 *     `/fr/admin` — added after construction via `extendRouter()`.
 *   • `buildUrl(locale, 'admin')` resolves through the same
 *     `LocaleUrlBuilder`, so admin links use `<LocaleLink>` like
 *     the rest of the app — no hardcoded paths.
 *
 * Order matters: the import must come AFTER `bootstrap` (which
 * triggers the router/cms construction) but BEFORE the
 * `bootstrapApp(...)` call (so registrations are in place when the
 * app mounts). `main.ts` is wired this way already.
 */

import { PageRenderer } from 'qdcms'
import { cms } from '../cms'
import { extendRouter } from '../router'
import AdminDashboard from './blocks/AdminDashboard.vue'

extendRouter([
  {
    name: 'admin',
    slugs: { en: 'admin', fr: 'admin' },
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'admin' }] },
  },
])

cms.block('admin-dashboard', { component: AdminDashboard })

cms.place('admin-dashboard', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'admin' } } },
})
