<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef, type Component } from 'vue'
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

let stopRouter: (() => void) | null = null
onMounted(() => {
  stopRouter = bindRouter(router, cms, { stackBuilder: withLocale(declaredStackBuilder) })
  if (import.meta.env.DEV) {
    bridge.value = createDemoDebug(cms)
  }
})
onUnmounted(() => {
  stopRouter?.()
  bridge.value?.uninstall()
  bridge.value = null
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

  <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
  <DebugBar v-if="bridge" :bridge="(bridge as any)" :panels="(debugPanels as any)" :collector-meta="debugMeta" />

  <!-- qdadm extras: Toast / ToastListener / qdadm debug bar. No-op
       when the corresponding qdadm options aren't configured. -->
  <QdadmRoot />
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
