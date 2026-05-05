<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, type Component } from 'vue'
import { LangSwitcher, bindRouter, declaredStackBuilder, useCms, withLocale } from 'qdcms'
import { useRouter } from 'vue-router'
import { DebugBar, type CollectorMeta, type DebugBridge } from '@quazardous/qddebug'
// QdadmRoot renders qdadm's DOM extras (Toast, ToastListener, the
// qdadm debug bar) when the host owns the Vue app — see
// admin/install-qdadm.ts.
import { QdadmRoot } from 'qdadm/components'
import { LOCALES, buildUrl } from './router'
import { createDemoDebug } from './debug/createDebug'
import StatePanel from './debug/StatePanel.vue'

// State-only qdcms collectors: render their snapshot().state via ObjectTree.
//
// `as unknown as Record<string, Component>` shuts up vue-tsc when the workspace
// has two physical Vue installations (one in qdadm/ via the qddebug `file:`
// link, one in qdcms/). Vite dedupes them at runtime — no actual problem.
const debugPanels = {
  'cms-context': StatePanel,
  'composed-page': StatePanel,
} as unknown as Record<string, Component>

const debugMeta: Record<string, CollectorMeta> = {
  'cms-context': { icon: 'pi-sitemap', label: 'Context', color: '#3b82f6' },
  'composed-page': { icon: 'pi-th-large', label: 'Composed', color: '#06b6d4' },
}

const router = useRouter()
const cms = useCms()
const bridge = shallowRef<DebugBridge | null>(null)
const isAdmin = ref(false)
// Show qcms's qddebug bar only on the front. On /admin, qdadm's own
// debug bar (via QdadmRoot) takes over with admin-specific panels
// (Toast, Zones, Auth, Entities, Router, I18n) — both bars use the
// same @quazardous/qddebug renderer so they'd visually stack if both
// were rendered at once.
const showQcmsDebug = computed(() => !!bridge.value && !isAdmin.value)

// Zone class on <body>. CSS in style.css scopes its element-selector
// rules (a, h1-h4, button, body bg/font) to `.qcms-zone` so they
// don't bleed into qdadm-rendered admin pages where PrimeVue / Aura
// owns the visual chrome. Toggling on every route change keeps the
// switch instant when navigating between zones.
function syncZone(path: string): void {
  const adm = path.startsWith('/admin')
  isAdmin.value = adm
  document.body.classList.toggle('qdadm-zone', adm)
  document.body.classList.toggle('qcms-zone', !adm)
}

let stopRouter: (() => void) | null = null
let stopRouteWatch: (() => void) | null = null
onMounted(() => {
  stopRouter = bindRouter(router, cms, { stackBuilder: withLocale(declaredStackBuilder) })
  stopRouteWatch = router.afterEach((to) => syncZone(to.path))
  syncZone(router.currentRoute.value.path)
  if (import.meta.env.DEV) {
    bridge.value = createDemoDebug(cms)
  }
})
onUnmounted(() => {
  stopRouter?.()
  stopRouteWatch?.()
  bridge.value?.uninstall()
  bridge.value = null
  document.body.classList.remove('qcms-zone', 'qdadm-zone')
})
</script>

<template>
  <RouterView />

  <!-- Floating language switch (independent of the debug bar so it stays
       visible even with debug disabled). To be moved into a proper header
       block once header blocks become locale-aware. -->
  <div class="demo-lang-switcher">
    <LangSwitcher :locales="LOCALES" :build-url="buildUrl" variant="dropdown" />
  </div>

  <!-- qcms's debug bar — front zone only. eslint-disable-next-line @typescript-eslint/no-explicit-any -->
  <DebugBar v-if="showQcmsDebug" :bridge="(bridge as any)" :panels="(debugPanels as any)" :collector-meta="debugMeta" />

  <!-- qdadm extras: Toast / ToastListener / qdadm debug bar. Mounted
       only on /admin so the qdadm debug bar (which uses the same
       @quazardous/qddebug renderer as qcms's) doesn't stack with the
       qcms one on the front. The qdadm bar carries admin-specific
       panels (Toast, Zones, Auth, Entities, Router, I18n). -->
  <QdadmRoot v-if="isAdmin" />
</template>

<style scoped>
.demo-lang-switcher {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 50;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
