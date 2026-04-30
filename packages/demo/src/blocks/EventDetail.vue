<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// EventDetail is a pure block: it receives `slug` as a prop, doesn't know
// anything about qdcms or vue-router. The placement decides what to inject.
const props = defineProps<{
  slug?: string | null
}>()

const events: Record<string, { title: string; date: string; description: string }> = {
  'spring-tournament': {
    title: 'Tournoi de printemps',
    date: '2026-05-12',
    description: 'Tournoi annuel ouvert aux licenciés. Inscriptions au club-house.',
  },
  'youth-camp': {
    title: 'Stage jeunes',
    date: '2026-05-20',
    description: 'Stage 5 jours pour les 8-14 ans encadré par les moniteurs du club.',
  },
}

const event = computed(() => (props.slug ? events[props.slug] : null))
</script>

<template>
  <article v-if="event" class="event-detail">
    <h1>{{ event.title }}</h1>
    <p class="meta">{{ event.date }}</p>
    <p>{{ event.description }}</p>
    <RouterLink to="/events">← retour</RouterLink>
  </article>
  <div v-else>
    <p>Événement introuvable. <RouterLink to="/events">retour à la liste</RouterLink></p>
  </div>
</template>

<style scoped>
.event-detail .meta { color: #666; font-variant-numeric: tabular-nums; }
.event-detail h1 { margin: 0 0 0.25rem; }
</style>
