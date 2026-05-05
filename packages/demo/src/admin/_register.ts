/**
 * admin/_register.ts — shared admin-zone wiring.
 *
 * The route + block + placement registration is identical whether
 * admin code lives in the main bundle (mono) or in its own chunk
 * (lazy). Only the AdminDashboard component reference differs:
 *
 *   • mono  → eager: `import AdminDashboard from './blocks/AdminDashboard.vue'`
 *   • lazy  → async: `defineAsyncComponent(() => import('./blocks/AdminDashboard.vue'))`
 *
 * This helper takes the component as an argument so the two flavours
 * (`register.ts`, `register.lazy.ts`) reuse one source of truth for
 * everything else.
 */

import type { Component } from 'vue'
import { PageRenderer } from 'qdcms'
import { cms } from '../cms'
import { extendRouter } from '../router'

export function registerAdminWith(dashboard: Component): void {
  extendRouter([
    {
      name: 'admin',
      slugs: { en: 'admin', fr: 'admin' },
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'admin' }] },
    },
  ])

  cms.block('admin-dashboard', { component: dashboard })

  cms.place('admin-dashboard', {
    region: 'main',
    when: { stack: { top: { type: 'page', name: 'admin' } } },
  })
}
