<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useCms } from 'qdcms'

const cms = useCms()

// The breadcrumb is a pure projection of the stack — no route awareness needed.
const trail = computed(() =>
  cms.context.stack.map((level) => {
    if (level.type === 'collection') return { label: level.name, href: `/${level.name}` }
    if (level.type === 'item') return { label: level.id ?? level.name, href: null }
    if (level.type === 'page') return { label: level.name, href: `/${level.name}` }
    return { label: level.name, href: null }
  })
)
</script>

<template>
  <nav v-if="trail.length > 1" class="breadcrumb">
    <template v-for="(t, i) in trail" :key="i">
      <RouterLink v-if="t.href" :to="t.href">{{ t.label }}</RouterLink>
      <span v-else>{{ t.label }}</span>
      <span v-if="i < trail.length - 1" class="sep">›</span>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  padding: 0.5rem 1rem;
  background: #fafafa;
  font-size: 0.85rem;
  color: #555;
}
.breadcrumb a { color: #2563eb; text-decoration: none; }
.sep { margin: 0 0.4rem; color: #aaa; }
</style>
