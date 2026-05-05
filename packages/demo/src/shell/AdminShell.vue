<script setup lang="ts">
/**
 * AdminShell — admin-only shell extras: qdadm DOM extras (Toast,
 * ToastListener, qdadm debug bar), body zone class. Mounted on
 * /admin/*, unmounted on every front route. Owns NO front
 * references — admin-side only.
 *
 * The actual qdadm wiring (Kernel, modules, routes) is done once at
 * boot in `bootstrap.ts → installQdadm()`. This shell only renders
 * the DOM extras qdadm expects to live next to its mounted root.
 */

import { onMounted, onUnmounted } from 'vue'
import { QdadmRoot } from 'qdadm/components'

onMounted(() => {
  document.body.classList.add('qdadm-zone')
})

onUnmounted(() => {
  document.body.classList.remove('qdadm-zone')
})
</script>

<template>
  <!-- :debug-bar="false" → the unified <DebugBar /> lives in App.vue
       and reads the shared bridge. QdadmRoot still mounts Toast +
       ToastListener (admin-only PrimeVue chrome). -->
  <QdadmRoot :debug-bar="false" />
</template>
