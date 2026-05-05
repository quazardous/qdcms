/**
 * bootstrap.ts — infra wiring engine.
 *
 * Backend-agnostic by design. `main.ts` decides whether a backend
 * runs in-tab (`./install-demo-backend` side-effect import) or on a
 * real server (classic mode). By the time this function is invoked
 * `globalThis.fetch` already routes to whichever backend is active —
 * we don't need to know which.
 *
 * Symfony-flavoured layering:
 *
 *   main.ts                    → infra entry: bundle scope + backend choice
 *   qdcms.config.ts            → business: plugins + seed (what the app IS)
 *   install-demo-backend.ts    → demo-only bridge (in-tab backend)
 *   bootstrap.ts (this file)   → wires CMS + router + Vue, mounts
 *   .env / vite.config         → low-level config
 */

import { createApp, type App as VueApp, type Component } from 'vue'
import { router, buildUrl } from './router'
import { cms } from './cms-instance'
import './cms' // side-effect: registers blocks/layouts/placements

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
  app.use(router)
  cms.install(app)
  return app
}
