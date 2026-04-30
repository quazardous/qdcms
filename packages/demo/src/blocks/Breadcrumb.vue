<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useCms } from 'qdcms'

const cms = useCms()

const crumbs = computed(() => {
  const labels: Record<string, string> = {
    realisations: 'Réalisations',
    prestations: 'Prestations',
    demarche: 'Démarche',
    contact: 'Contact',
    me: 'Mon espace',
  }
  const out: { label: string; to?: string }[] = [{ label: 'Accueil', to: '/' }]
  const stack = cms.context.stack
  let path = ''
  stack.forEach((level, i) => {
    if (level.type === 'collection') {
      path = `/${level.name}`
      out.push({ label: labels[level.name] ?? level.name, to: path })
    } else if (level.type === 'item') {
      // Last item: not clickable, label from current realization (best-effort)
      out.push({ label: level.id ?? level.name })
    } else if (level.type === 'page' && level.name !== 'home') {
      path = `/${level.name}`
      out.push({ label: labels[level.name] ?? level.name, to: i === stack.length - 1 ? undefined : path })
    }
  })
  return out
})
</script>

<template>
  <nav class="breadcrumb" aria-label="Fil d'ariane">
    <template v-for="(c, i) in crumbs" :key="i">
      <RouterLink v-if="c.to && i < crumbs.length - 1" :to="c.to">{{ c.label }}</RouterLink>
      <span v-else class="breadcrumb__current">{{ c.label }}</span>
      <span v-if="i < crumbs.length - 1" class="breadcrumb__sep" aria-hidden>›</span>
    </template>
  </nav>
</template>
