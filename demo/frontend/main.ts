/**
 * main.ts — infra entry (the technical control panel of the demo).
 *
 * INFRA, not business. This file answers "how does the app boot?".
 * Business config lives in `qdcms.config.ts`; this file just plugs
 * everything into the runtime and exposes the technical toggles.
 *
 * Two responsibilities, kept ultra-thin on purpose:
 *
 *   1. SCOPE OF THE BUNDLE — single-bundle SPA, front + admin in one
 *      entry point. Admin (qdadm) is wired by `bootstrap.ts` against
 *      the same Vue app, sharing router and SignalBus with qdcms.
 *      Splitting into multi-SPA would mean duplicating this file as
 *      `main-admin.ts` + Vite multi-entry — out of scope.
 *
 *   2. BACKEND BRIDGE — backend running in this tab (demo-only,
 *      static-site friendly) or classic remote (real Node server).
 *      Toggle below — Vite drops the entire in-browser-backend
 *      graph from the bundle when the import is commented out.
 *
 * Everything else lives in the layers below. Resist the urge to
 * grow this file.
 */

import { bootstrapApp } from './bootstrap'
import App from './App.vue'
import './style.css'

/* ─── BACKEND — pick ONE ──────────────────────────────────────────────
 *   ▸ in-browser bridge: a real qdcms-backend running in this tab,
 *     wired to fetch via qdcms-api-emulator. Demo-only, no server
 *     needed. Adds qdcms-backend/browser + qdcms-api-emulator + the
 *     seed data to the main bundle.
 *   ▸ classic: comment the import below; fetch then hits a real
 *     Node server at /api/qdcms/* (Vite proxy in dev, real server
 *     in prod). The in-browser-backend graph is dropped from the
 *     bundle entirely. Run a server beside the SPA — see the Node
 *     `createBackend` factory in @quazardous/qdcms-backend.        */
import './install-demo-backend'
/* ─────────────────────────────────────────────────────────────────── */

bootstrapApp({ App }).then((app) => app.mount('#app'))
