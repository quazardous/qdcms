/**
 * admin/_register.ts — shared admin-zone wiring.
 *
 * Admin lives at a raw, non-localised `/admin` path — operational UIs
 * are typically not URL-localised. The route is added directly via
 * `router.addRoute()`; we do NOT push to the i18n slug table because
 * `buildUrl(locale, name)` is for public, locale-aware URLs only.
 * `reservedPaths: ['/admin']` (set in `router.ts`) keeps the public
 * catch-all and the root redirect from interfering.
 *
 * The route + block registration is identical whether admin code
 * lives in the main bundle (mono) or in its own chunk (lazy); only
 * the dashboard component reference differs:
 *
 *   • mono → eager: `import AdminDashboard from '...'`
 *   • lazy → async: `defineAsyncComponent(() => import('...'))`
 *
 * This helper takes the component as an argument so the two flavours
 * (`register.ts`, `register.lazy.ts`) reuse one source of truth.
 */

import type { Component } from 'vue'
import { PageRenderer } from 'qdcms'
import { cms } from '../cms-instance'
import { router } from '../router'
import AdminLayout from './layouts/AdminLayout.vue'

export function registerAdminWith(dashboard: Component): void {
  router.addRoute({
    path: '/admin',
    name: 'admin',
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'admin' }] },
  })

  // Admin gets its own layout (one region: main) — without header /
  // footer regions, the public-site placements (SiteNav, SiteFooter)
  // are simply not rendered on admin pages, which avoids the
  // useLocaleUrl crash they would hit on a non-i18n route.
  cms.layout('admin', AdminLayout, ['main'])

  cms.block('admin-dashboard', { component: dashboard })

  cms.place('admin-dashboard', {
    region: 'main',
    when: { stack: { top: { type: 'page', name: 'admin' } } },
  })
}
