<script setup lang="ts">
/**
 * App.vue — root component. Pure integration shell: it picks which
 * zone shell renders based on the active route, and that's it. No
 * qcms-specific logic, no qdadm-specific logic — front and admin
 * concerns are encapsulated in `FrontShell.vue` / `AdminShell.vue`
 * respectively (zero intersection between the two zones).
 */

import { computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import FrontShell from './shell/FrontShell.vue'
import AdminShell from './shell/AdminShell.vue'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))

onUnmounted(() => {
  document.body.classList.remove('qcms-zone', 'qdadm-zone')
})
</script>

<template>
  <RouterView />
  <FrontShell v-if="!isAdmin" />
  <AdminShell v-else />
</template>
