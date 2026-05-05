<script setup lang="ts">
/**
 * FrontShell — qcms-only shell extras: lang switch, qcms debug bar,
 * router stack binding, body zone class. Mounted on every front
 * route, unmounted on /admin/*. Owns NO admin references — qcms-side
 * only. The integration layer (`App.vue`) decides which shell to
 * render based on the active route.
 */

import { onMounted, onUnmounted, shallowRef, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { LangSwitcher, bindRouter, declaredStackBuilder, useCms, withLocale } from 'qdcms'
import { DebugBar, type CollectorMeta, type DebugBridge } from '@quazardous/qddebug'
import { LOCALES, buildUrl } from '../router'
import { createDemoDebug } from '../debug/createDebug'
import StatePanel from '../debug/StatePanel.vue'

// State-only qdcms collectors: render their snapshot().state via
// ObjectTree. Cast goes through `unknown` because the workspace has
// two physical Vue installs (one in qdadm/, one in qdcms/) — Vite
// dedupes them at runtime, types stay distinct.
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
  document.body.classList.add('qcms-zone')
  stopRouter = bindRouter(router, cms, { stackBuilder: withLocale(declaredStackBuilder) })
  if (import.meta.env.DEV) {
    bridge.value = createDemoDebug(cms)
  }
})

onUnmounted(() => {
  document.body.classList.remove('qcms-zone')
  stopRouter?.()
  stopRouter = null
  bridge.value?.uninstall()
  bridge.value = null
})
</script>

<template>
  <!-- Floating language switch — front zone only. To be moved into a
       proper header block once header blocks become locale-aware. -->
  <div class="demo-lang-switcher">
    <LangSwitcher :locales="LOCALES" :build-url="buildUrl" variant="dropdown" />
  </div>

  <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
  <DebugBar v-if="bridge" :bridge="(bridge as any)" :panels="(debugPanels as any)" :collector-meta="debugMeta" />
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
