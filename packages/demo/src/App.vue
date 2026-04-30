<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { bindRouter, useCms } from 'qdcms'

const route = useRoute()
const router = useRouter()
const cms = useCms()

let stop: (() => void) | null = null
onMounted(() => {
  // Default StackBuilder = declaredStackBuilder (reads route.meta.stack).
  // Replace via { stackBuilder: yourBuilder } to plug entity-walk, API resolution, etc.
  stop = bindRouter(router, cms)
})
onUnmounted(() => stop?.())
</script>

<template>
  <RouterView />
  <div class="debug-bar">
    <span>route: <code>{{ route.path }}</code></span>
    <span>stack: <code>{{ cms.context.stack.map(l => `${l.type}:${l.name}${l.id ? '#' + l.id : ''}`).join(' / ') || '∅' }}</code></span>
    <span>auth: <code>{{ cms.context.auth.isAuthenticated ? 'in' : 'out' }}</code></span>
    <span class="links">
      <RouterLink to="/">/</RouterLink>
      <RouterLink to="/events">/events</RouterLink>
      <RouterLink to="/events/spring-tournament">/events/spring-tournament</RouterLink>
      <RouterLink to="/me">/me</RouterLink>
    </span>
  </div>
</template>

<style scoped>
.debug-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 1rem;
  padding: 0.4rem 0.8rem;
  background: #1f2937;
  color: #d1d5db;
  font-family: monospace;
  font-size: 0.8rem;
  align-items: center;
}
.debug-bar code { color: #fbbf24; }
.debug-bar .links { margin-left: auto; display: flex; gap: 0.6rem; }
.debug-bar .links a { color: #93c5fd; }
</style>
