<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { bindRouter, useCms } from 'qdcms'

const route = useRoute()
const router = useRouter()
const cms = useCms()

const showDebug = ref(import.meta.env.DEV)

let stop: (() => void) | null = null
onMounted(() => {
  stop = bindRouter(router, cms)
})
onUnmounted(() => stop?.())
</script>

<template>
  <RouterView />
  <div v-if="showDebug" class="debug-bar">
    <span>route: <code>{{ route.path }}</code></span>
    <span>stack: <code>{{ cms.context.stack.map(l => `${l.type}:${l.name}${l.id ? '#' + l.id : ''}`).join(' / ') || '∅' }}</code></span>
    <span>auth: <code>{{ cms.context.auth.isAuthenticated ? 'in' : 'out' }}</code></span>
    <span class="links">
      <RouterLink to="/">/</RouterLink>
      <RouterLink to="/realisations">/realisations</RouterLink>
      <RouterLink to="/me">/me</RouterLink>
      <button
        type="button"
        @click="showDebug = false"
        style="background: transparent; border: 1px solid #555; color: #ccc; cursor: pointer; padding: 0 0.5rem; border-radius: 3px; font-size: inherit; font-family: inherit;"
      >hide</button>
    </span>
  </div>
</template>
