/**
 * bootstrap.ts — infra wiring engine.
 *
 * Backend-agnostic by design. `main.ts` decides whether a backend
 * runs in-tab (`./install-demo-backend` side-effect import) or on a
 * real server (classic mode). By the time this function is invoked
 * `globalThis.fetch` already routes to whichever backend is active —
 * we don't need to know which.
 *
 * Order matters: qdadm's Kernel registers its `/admin/*` routes on
 * the shared router via `addRoute()`. Those routes MUST be present
 * before `app.use(router)` triggers vue-router's initial navigation,
 * otherwise the qdcms catch-all swallows `/admin` on a cold load.
 * So the host runs `installQdadm(app)` BEFORE `app.use(router)`.
 *
 * Symfony-flavoured layering:
 *
 *   main.ts                    → infra entry: bundle scope + backend choice
 *   config/                    → business: plugins, seed, locales, slug-table (§6.6)
 *   install-demo-backend.ts    → demo-only bridge (in-tab backend)
 *   bootstrap.ts (this file)   → wires CMS + router + Vue, mounts
 *   .env / vite.config         → low-level config
 */

import { createApp, type App as VueApp, type Component } from 'vue'
import { router, buildUrl } from './router'
import { cms } from './cms-instance'
import './cms' // side-effect: registers blocks/layouts/placements
import { installQdadm } from './install-qdadm'
import { debugBridge } from './debugBridge'
import { addQdcmsCollectors } from './debug/qdcmsCollectors'

export interface BootstrapInput {
  /** Root component. main.ts decides which one (front / admin / shell). */
  App: Component
}

export async function bootstrapApp({ App }: BootstrapInput): Promise<VueApp> {
  // Register the URL builder before mounting so any block rendered on
  // first paint can call `useLocaleUrl()` without an empty-builder
  // throw. Hardcoded paths are forbidden in qdcms code.
  cms.setUrlBuilder(buildUrl)

  const app = createApp(App)

  // Plug qdadm BEFORE `app.use(router)`: the Kernel registers its
  // `/admin/*` routes on the shared router via `addRoute()`. Doing
  // that first means vue-router's initial navigation (triggered by
  // `app.use(router)`) sees the full route table — no need for a
  // post-mount `router.replace({force:true})` to re-resolve.
  const kernel = installQdadm(app)

  app.use(router)
  cms.install(app)

  // qdcms collectors register on the same shared bridge — ensures
  // ONE <DebugBar /> can render both qdcms and qdadm panels. Single
  // install at the end covers all collectors with a merged context:
  // qdadm internals come from `kernel.getDebugContext()` (stable
  // surface), qdcms contributes `cms`. Each collector picks what it
  // needs and ignores the rest.
  if (import.meta.env.DEV) {
    addQdcmsCollectors(debugBridge)
    debugBridge.install({
      ...kernel.getDebugContext(),
      cms,
    })
  }

  return app
}
