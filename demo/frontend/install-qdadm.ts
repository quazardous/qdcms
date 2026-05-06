/**
 * admin/install-qdadm.ts — wire qdadm's Kernel onto the demo's
 * existing Vue app + router + SignalBus, mounting the whole admin
 * tree under `/admin/*`.
 *
 * IoC stance: the demo (host shell) created the shared services;
 * the Kernel REUSES them via its `existingApp` / `existingRouter` /
 * `existingSignals` injection options instead of spinning up its own.
 * The host stays the owner of the Vue lifecycle; qdadm is a guest.
 *
 * Why Kernel rather than `createQdadm` directly: Kernel does ~15
 * setups beyond the plugin (ZoneRegistry, ActiveStack, DeferredRegistry,
 * PermissionRegistry, Security, EventRouter, SSEBridge, LayoutComponents,
 * DebugModule, NotificationModule, …). Replicating them by hand drifts
 * with every qdadm release.
 *
 * What's NOT enabled yet:
 *   • `features.auth: false` — no shared authAdapter wired yet, so
 *     login/users/roles modules stay off until qdcms and qdadm agree
 *     on an auth source-of-truth.
 *   • No entity managers — Slice 3 will register one bound to
 *     `/api/qdcms/entity/realization` for shared admin CRUD.
 */

import type { App } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import { Kernel, type KernelOptions } from 'qdadm'
import { debugBar } from 'qdadm/modules/debug'
import { AppLayout } from 'qdadm/components'
import 'qdadm/styles'
import 'primeicons/primeicons.css'

import { signals } from './signals'
import { debugBridge } from './debugBridge'
import { router } from './router'
import AdminHome from './pages/AdminHome.vue'
import { version as demoVersion } from './package.json'

export function installQdadm(app: App): Kernel {
  const options: KernelOptions = {
    // Host injection — Kernel reuses these instead of creating its own.
    existingApp: app,
    existingRouter: router,
    existingSignals: signals,
    // Mount the entire admin tree under /admin/*. Kernel-emitted
    // routes (`/`, `/:pathMatch(.*)*`, `/login`) become `/admin`,
    // `/admin/:pathMatch(.*)*`, `/admin/login`.
    routePrefix: '/admin',

    // pages.layout is the qdadm chrome rendered at /admin.
    pages: { layout: AppLayout },
    homeRoute: { name: 'admin-home', component: AdminHome },

    app: {
      name: 'Flower Craft',
      shortName: 'FC',
      version: demoVersion,
    },

    primevue: { plugin: PrimeVue, theme: Aura },

    // Auto-injects DebugModule. The `bridge` field tells the module
    // to register its collectors onto the host's shared bridge instead
    // of creating its own — the demo renders ONE unified <DebugBar />
    // covering both qdcms and qdadm panels.
    //
    // Cast: qdadm's `DebugBarConfig.module` is typed as
    // `new (options: unknown) => unknown` which is contravariantly
    // incompatible with concrete module classes (DebugModule expects
    // DebugModuleOptions). Runtime is fine; type-only mismatch.
    debugBar: {
      ...debugBar,
      bridge: debugBridge,
    } as KernelOptions['debugBar'],
    notifications: { enabled: true, maxNotifications: 100 },

    features: {
      // Skip auth wiring (no shared authAdapter yet — Slice 2/3).
      auth: false,
    },

    debug: import.meta.env.DEV,
  }

  const kernel = new Kernel(options)

  // Kernel.createApp() runs all setups (signals, hooks, registries,
  // modules, plugins) on the existing app and returns it. We don't
  // mount — the host shell does that.
  kernel.createApp()
  return kernel
}
