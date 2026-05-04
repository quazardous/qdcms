<script setup lang="ts">
import { computed } from 'vue'
import { LocaleLink, useCms } from 'qdcms'

const cms = useCms()

interface Crumb {
  label: string
  /** Logical route name; omitted for the active leaf (rendered as text). */
  name?: string
  params?: Record<string, string | number>
}

const crumbs = computed<Crumb[]>(() => {
  const labels: Record<string, string> = {
    realisations: 'Réalisations',
    prestations: 'Prestations',
    demarche: 'Démarche',
    contact: 'Contact',
    me: 'Mon espace',
  }
  const out: Crumb[] = [{ label: 'Accueil', name: 'home' }]
  const stack = cms.context.stack
  stack.forEach((level, i) => {
    const isLast = i === stack.length - 1
    if (level.type === 'collection') {
      out.push({ label: labels[level.name] ?? level.name, name: level.name })
    } else if (level.type === 'item') {
      // Active item: not clickable, label is the slug (best-effort).
      out.push({ label: level.id ?? level.name })
    } else if (level.type === 'page' && level.name !== 'home') {
      out.push({
        label: labels[level.name] ?? level.name,
        name: isLast ? undefined : level.name,
      })
    }
  })
  return out
})
</script>

<template>
  <nav class="breadcrumb" aria-label="Fil d'ariane">
    <template v-for="(c, i) in crumbs" :key="i">
      <LocaleLink v-if="c.name && i < crumbs.length - 1" :name="c.name" :params="c.params">
        {{ c.label }}
      </LocaleLink>
      <span v-else class="breadcrumb__current">{{ c.label }}</span>
      <span v-if="i < crumbs.length - 1" class="breadcrumb__sep" aria-hidden>›</span>
    </template>
  </nav>
</template>
