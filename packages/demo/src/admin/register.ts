/**
 * admin/register.ts — MONO mode.
 *
 * Eager static import of `AdminDashboard.vue` → Vite folds it (and
 * everything it imports) into the main bundle. Single-bundle SPA,
 * no extra network round-trip when the user navigates to /admin.
 *
 * For the chunk-split variant, see `register.lazy.ts`.
 */

import AdminDashboard from './blocks/AdminDashboard.vue'
import { registerAdminWith } from './_register'

registerAdminWith(AdminDashboard)
