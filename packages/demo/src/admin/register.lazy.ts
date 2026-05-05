/**
 * admin/register.lazy.ts — LAZY mode.
 *
 * `AdminDashboard.vue` is wrapped in `defineAsyncComponent` and
 * imported via `import('./blocks/AdminDashboard.vue')`. Vite's
 * static analysis recognises the dynamic import and emits
 * AdminDashboard (plus its transitive deps that aren't already in
 * the main bundle) as a separate chunk fetched on first render.
 *
 * The route and block are still REGISTERED at boot — only the heavy
 * code inside the dashboard is deferred. That way navigating to
 * /admin works immediately; the chunk loads while the async
 * component shows its (Vue-managed) loading state.
 *
 * For the all-in-one variant, see `register.ts`.
 */

import { defineAsyncComponent } from 'vue'
import { registerAdminWith } from './_register'

const AdminDashboard = defineAsyncComponent(
  () => import('./blocks/AdminDashboard.vue'),
)

registerAdminWith(AdminDashboard)
