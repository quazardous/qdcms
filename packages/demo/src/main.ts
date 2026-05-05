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
 * The admin zone is mandatory for the demo; only HOW its code is
 * delivered is configurable (see the mono/lazy toggle below).
 *
 * Everything else (declarative config, wiring, env reading) lives
 * in the layers below. Resist the urge to grow this file.
 */

import { bootstrapApp } from './bootstrap'
import config from './qdcms.config'
import './style.css'

import App from './App.vue'

/* ─── Admin runtime split — exactly ONE active import below ───────────
 *
 *   mono → admin code is part of the main bundle (sync, simplest)
 *   lazy → admin code is its own chunk, fetched on first render
 *          (`defineAsyncComponent` keeps route + block registered
 *           eagerly so navigation is instant; only the dashboard
 *           component code is deferred)
 *
 * To switch: comment the active line, uncomment the other. Vite picks
 * the bundle shape from the import syntax — nothing else to change.
 */
import './admin/register'           // ← MONO   (current default)
// import './admin/register.lazy'   // ← LAZY
/* ─────────────────────────────────────────────────────────────────── */

bootstrapApp({ App, config }).then((app) => app.mount('#app'))
