<script setup lang="ts">
/**
 * FrontShell — qdcms-only shell extras: lang switch, router stack
 * binding, body zone class. Mounted on every front route, unmounted
 * on /admin/*. Owns NO admin references — qdcms-side only.
 *
 * The unified `<DebugBar />` lives in `App.vue` (zone-agnostic) and
 * reads the shell-owned shared bridge — qdcms's debug collectors are
 * registered on it from `bootstrap.ts`. No bridge management here.
 */

import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { LangSwitcher, bindRouter, declaredStackBuilder, useCms, withLocale } from 'qdcms'
import { LOCALES, buildUrl } from '../router'

const router = useRouter()
const cms = useCms()

let stopRouter: (() => void) | null = null

onMounted(() => {
  document.body.classList.add('qdcms-zone')
  stopRouter = bindRouter(router, cms, { stackBuilder: withLocale(declaredStackBuilder) })
})

onUnmounted(() => {
  document.body.classList.remove('qdcms-zone')
  stopRouter?.()
  stopRouter = null
})
</script>

<template>
  <!-- Floating language switch — front zone only. To be moved into a
       proper header block once header blocks become locale-aware. -->
  <div class="demo-lang-switcher">
    <LangSwitcher :locales="LOCALES" :build-url="buildUrl" variant="dropdown" />
  </div>
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
