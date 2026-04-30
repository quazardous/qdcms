<script setup lang="ts">
import { computed, h } from 'vue'
import { useCms } from '../composables/useCms'

const cms = useCms()

const layout = computed(() => {
  const page = cms.composedPage.value
  if (!page) return null
  const def = cms.layouts.get(page.layout)
  if (!def) {
    console.warn(`[qdcms] layout "${page.layout}" not registered`)
    return null
  }
  return def.component
})

const fallback = () =>
  h('div', { class: 'qdcms-fallback' }, [
    h('p', 'No layout. Register one with cms.layout("default", DefaultLayout).'),
  ])
</script>

<template>
  <component v-if="layout" :is="layout" />
  <component v-else :is="fallback" />
</template>
