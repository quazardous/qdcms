/**
 * main.ts — infra entry (the Symfony `index.php` of this app).
 *
 * INFRA, not business. This file answers "how does the app boot?",
 * never "what is the app about?". Business config lives in
 * `qdcms.config.ts`; this file just plugs it into the runtime.
 *
 * Two technical responsibilities, kept ultra-thin on purpose:
 *
 *   1. SCOPE OF THE BUNDLE — set below by which Option block is active.
 *   2. ROOT COMPONENT       — which App component gets mounted.
 *
 * Everything else (declarative config, wiring, env reading) lives in
 * the layers below. Resist the urge to grow this file.
 */

import { bootstrapApp } from './bootstrap'
import config from './qdcms.config'
import './style.css'

// ─── ACTIVATE ONE SPA SHAPE — flip by (un)commenting ──────────────────
// `bootstrap.ts` and `qdcms.config.ts` stay untouched whichever you pick.

// ▼ Option A — single bundle, front only  (current default)
import App from './App.vue'

// ▼ Option B — single bundle, front + admin  (one SPA, two zones)
// Uncomment the line below to ship the admin zone in this same bundle.
// `admin/register.ts` is a side-effect module: it adds `/en/admin` and
// `/fr/admin` routes to the existing router and registers the admin
// blocks against the shared CMS instance. No other change is needed.
// import './admin/register'
// ──────────────────────────────────────────────────────────────────────

bootstrapApp({ App, config }).then((app) => app.mount('#app'))
