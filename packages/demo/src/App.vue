<script setup lang="ts">
/**
 * App.vue — root component. Pure integration shell:
 *  - picks which zone shell renders based on the route
 *  - renders the ONE unified <DebugBar /> (zone-agnostic, dev-tooling)
 *
 * Front and admin templates have zero intersection (each zone stays
 * inside its shell). The debug bar is dev-tooling — explicitly
 * cross-zone — so it lives here at the integration layer with merged
 * panels from both qcms and qdadm collectors.
 */

import { computed, onUnmounted, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { DebugBar, type CollectorMeta } from '@quazardous/qddebug'
import { adminPanels, adminPanelsMeta } from 'qdadm/modules/debug'
import StatePanel from './debug/StatePanel.vue'
import { debugBridge } from './shell/debugBridge'
import FrontShell from './shell/FrontShell.vue'
import AdminShell from './shell/AdminShell.vue'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))

// Merged panels: qcms-specific (cms-context, composed-page) +
// qdadm admin panels (zones, auth, entities, router, i18n).
// Errors / Signals / Toasts panels come from qddebug's defaults.
// Cast through `unknown` because the workspace has two physical Vue
// installs (one per workspace `file:`-link); Vite dedupes at runtime.
const debugPanels = {
  'cms-context': StatePanel,
  'composed-page': StatePanel,
  ...(adminPanels as unknown as Record<string, Component>),
} as unknown as Record<string, Component>

const debugMeta: Record<string, CollectorMeta> = {
  'cms-context': { icon: 'pi-sitemap', label: 'Context', color: '#3b82f6' },
  'composed-page': { icon: 'pi-th-large', label: 'Composed', color: '#06b6d4' },
  ...adminPanelsMeta,
}

onUnmounted(() => {
  document.body.classList.remove('qcms-zone', 'qdadm-zone')
})
</script>

<template>
  <RouterView />
  <FrontShell v-if="!isAdmin" />
  <AdminShell v-else />

  <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
  <DebugBar :bridge="(debugBridge as any)" :panels="(debugPanels as any)" :collector-meta="debugMeta" />
</template>
