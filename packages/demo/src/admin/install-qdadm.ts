/**
 * admin/install-qdadm.ts — wire qdadm as a Vue plugin onto the
 * existing demo app, sharing services with qdcms.
 *
 * IoC stance: the demo's shell created the SignalBus and the Vue
 * Router; this function hands them to qdadm via `createQdadm` (the
 * plugin variant) and `Orchestrator(signals)`. qdadm does NOT spin
 * up its own router or its own bus — events flow across both
 * frameworks naturally.
 *
 * What it skips for Slice 1 (visual shell only):
 *   • `features.auth: false` — no authAdapter wired yet. Login/users/
 *     roles modules stay off until we share an auth source-of-truth.
 *   • `toast` is a console stub. PrimeVue's ToastService will replace
 *     it once we decide on toast UX (qdcms front blocks may want to
 *     surface toasts too).
 *   • No qdadm modules registered — AppLayout renders empty chrome
 *     so we can confirm the integration before adding entities.
 */

import type { App, Plugin as VuePlugin } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import { createQdadm, Orchestrator, type ToastService } from 'qdadm'
import 'qdadm/styles'
import 'primeicons/primeicons.css'

import { signals } from '../shell/signals'
import { router } from '../router'

/**
 * Stub toast — Slice 1 placeholder until we wire PrimeVue's
 * ToastService (or another unified UX) shared between admin + front.
 */
const toast: ToastService = {
  add: (opts) => {
    // eslint-disable-next-line no-console
    console.log(`[toast:${opts.severity}] ${opts.summary} — ${opts.detail}`)
  },
}

export function installQdadm(app: App): void {
  app.use(createPinia())
  app.use(PrimeVue, { theme: { preset: Aura } })

  const orchestrator = new Orchestrator({ signals, managers: {} })

  // Cast to bypass cross-package Vue type duplication. qdadm is
  // consumed via a `file:` link from a separate npm tree, so its
  // node_modules has its own copies of `vue` / `vue-router`; TS sees
  // two distinct `Component`/`Router`/`Plugin` types. Vite dedupes
  // both at bundle time (see `vite.config.ts`), so this is a type-
  // only mismatch — runtime is fine. A cleaner fix is to consume
  // qdadm's built `dist/types` once it ships that, or to flatten the
  // npm tree so qdadm reuses our copies.
  app.use(
    createQdadm({
      router: router as unknown as Parameters<typeof createQdadm>[0]['router'],
      orchestrator,
      toast,
      features: {
        // No auth wiring yet — keeps qdadm from requiring an
        // authAdapter and from registering its users/roles modules.
        auth: false,
        breadcrumb: true,
        poweredBy: false,
      },
      app: {
        name: 'Flower Craft — Admin',
        shortName: 'FC Admin',
      },
    }) as unknown as VuePlugin,
  )
}
