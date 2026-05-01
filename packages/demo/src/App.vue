<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { LangSwitcher, bindRouter, useCms } from 'qdcms'
import { LOCALES, buildUrl } from './router'

const route = useRoute()
const router = useRouter()
const cms = useCms()

const showDebug = ref(import.meta.env.DEV)

let stop: (() => void) | null = null
onMounted(() => {
  stop = bindRouter(router, cms)
})
onUnmounted(() => stop?.())

const activeLocale = computed(() => (route.meta.locale as string | undefined) ?? '?')
const currentRouteName = computed(() => (route.meta.routeName as string | undefined) ?? '?')
</script>

<template>
  <RouterView />
  <div v-if="showDebug" class="debug-bar">
    <span>route: <code>{{ route.path }}</code></span>
    <span>locale: <code>{{ activeLocale }}</code> / name: <code>{{ currentRouteName }}</code></span>
    <span>stack: <code>{{ cms.context.stack.map(l => `${l.type}:${l.name}${l.id ? '#' + l.id : ''}`).join(' / ') || '∅' }}</code></span>
    <span>auth: <code>{{ cms.context.auth.isAuthenticated ? 'in' : 'out' }}</code></span>
    <span class="links">
      <RouterLink :to="buildUrl(activeLocale === '?' ? 'en' : activeLocale, 'home')">home</RouterLink>
      <RouterLink :to="buildUrl(activeLocale === '?' ? 'en' : activeLocale, 'realisations')">works</RouterLink>
      <RouterLink :to="buildUrl(activeLocale === '?' ? 'en' : activeLocale, 'me')">me</RouterLink>
    </span>
    <LangSwitcher :locales="LOCALES" :build-url="buildUrl" />
    <button
      type="button"
      @click="showDebug = false"
      style="background: transparent; border: 1px solid #555; color: #ccc; cursor: pointer; padding: 0 0.5rem; border-radius: 3px; font-size: inherit; font-family: inherit;"
    >hide</button>
  </div>
</template>
