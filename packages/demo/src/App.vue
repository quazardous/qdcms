<script setup lang="ts">
/**
 * App.vue — root component. Pure integration shell:
 *  - picks which zone shell renders based on the route
 *  - renders the ONE unified <DebugBar /> (zone-agnostic, dev-tooling)
 *
 * Front and admin templates have zero intersection (each zone stays
 * inside its shell). The debug bar is dev-tooling — explicitly
 * cross-zone — so it lives here at the integration layer with merged
 * panels from both qdcms and qdadm collectors.
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

// Merged panels: qdcms-specific (cms-context, composed-page) +
// qdadm admin panels (zones, auth, entities, router, i18n).
// Errors / Signals / Toasts panels come from qddebug's defaults.
const debugPanels: Record<string, Component> = {
  'cms-context': StatePanel,
  'composed-page': StatePanel,
  ...adminPanels,
}

const debugMeta: Record<string, CollectorMeta> = {
  'cms-context': { icon: 'pi-sitemap', label: 'Context', color: '#3b82f6' },
  'composed-page': { icon: 'pi-th-large', label: 'Composed', color: '#06b6d4' },
  ...adminPanelsMeta,
}

onUnmounted(() => {
  document.body.classList.remove('qdcms-zone', 'qdadm-zone')
})
</script>

<template>
  <RouterView />
  <FrontShell v-if="!isAdmin" />
  <AdminShell v-else />

  <DebugBar :bridge="debugBridge" :panels="debugPanels" :collector-meta="debugMeta" />
</template>
