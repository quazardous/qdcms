/**
 * main.ts — infra entry (the Symfony `index.php` of this app).
 *
 * INFRA, not business. This file answers "how does the app boot?",
 * never "what is the app about?". Business config lives in
 * `qdcms.config.ts`; this file just plugs it into the runtime.
 *
 * Two technical responsibilities, kept ultra-thin on purpose:
 *
 *   1. SCOPE OF THE BUNDLE — what's compiled into this entry point.
 *   2. ROOT COMPONENT       — which App component gets mounted.
 *
 * SPA shape: single-bundle, front + admin in the same entry point.
 * The admin zone is mandatory for the demo, so it's wired in
 * unconditionally via the side-effect import below. Splitting front
 * and admin into separate SPAs would mean duplicating this file as
 * `main-admin.ts` and configuring Vite multi-entry — deliberately
 * out of scope here.
 *
 * Everything else (declarative config, wiring, env reading) lives in
 * the layers below. Resist the urge to grow this file.
 */

import { bootstrapApp } from './bootstrap'
import config from './qdcms.config'
import './style.css'

import App from './App.vue'

// Admin zone — always on. Side-effect module: registers admin blocks
// and placements against the shared CMS instance and adds
// locale-prefixed `/{locale}/admin` routes to the existing router.
import './admin/register'

bootstrapApp({ App, config }).then((app) => app.mount('#app'))
