/**
 * bootstrap.ts — infra wiring engine.
 *
 * Reads a declarative `QdcmsAppConfig` (business), branches between
 * backend modes (in-browser fake / remote HTTP), and returns a
 * mounted-ready Vue app. Symfony-flavoured layering:
 *
 *   main.ts            → infra entry: bundle scope + root component
 *   qdcms.config.ts    → business: what the app IS (plugins, seed, mode)
 *   bootstrap.ts       → infra wiring: glues business config to runtime
 *   .env / vite.config → low-level config (env, base URL, build)
 *
 * Bundle activation (single-bundle vs. SPA-per-runtime) is decided in
 * `main.ts` by what gets imported there — this file is bundle-blind.
 */

import { createApp, type App as VueApp, type Component } from 'vue'
import { installEmulator } from '@quazardous/qdcms-api-emulator'
import { router, buildUrl } from './router'
import { cms } from './cms'
import { createDemoBackend } from './demo-backend'
import type { DemoPlugin, DemoSeed } from './demo-backend'

export type BackendMode = 'browser' | 'remote'

export interface BrowserBackendConfig {
  mode: 'browser'
  /**
   * Plugins the in-browser fake should expose under `/plugins`. The
   * mock derives physical table names from `prefix + tables`.
   */
  plugins: DemoPlugin[]
  /** Initial rows, keyed by logical entity name. */
  seed?: DemoSeed
  /**
   * Persistence strategy for the in-browser store.
   * `localStorage` (default) survives reloads + restarts.
   */
  persist?: 'localStorage' | 'sessionStorage' | 'none'
}

export interface RemoteBackendConfig {
  mode: 'remote'
  /**
   * Base URL of the real HTTP backend. The frontend storage already
   * targets `/api/qdcms`; this URL is informational for now and will
   * become the actual fetch target once `ApiFrontendStorage` is
   * parameterised.
   */
  url: string
}

export interface QdcmsAppConfig {
  backend: BrowserBackendConfig | RemoteBackendConfig
}

export interface BootstrapInput {
  /** Root component. main.ts decides which one (front / admin / shell). */
  App: Component
  config: QdcmsAppConfig
}

export async function bootstrapApp({ App, config }: BootstrapInput): Promise<VueApp> {
  // Register the URL builder before mounting so any block rendered on
  // first paint can call `useLocaleUrl()` without an empty-builder
  // throw. Hardcoded paths are forbidden in qdcms code.
  cms.setUrlBuilder(buildUrl)

  if (config.backend.mode === 'browser') {
    const backend = createDemoBackend({
      plugins: config.backend.plugins,
      seed: config.backend.seed,
      persist: config.backend.persist,
    })
    installEmulator({ backend })
  }
  // mode === 'remote' → no interceptor; fetch hits the real backend.

  const app = createApp(App)
  app.use(router)
  cms.install(app)
  return app
}
