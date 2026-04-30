<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ limit?: number }>()

// Mock data — in real Krorg, a block fetches via EntityManager
const events = [
  { id: 1, title: 'Tournoi de printemps', date: '2026-05-12' },
  { id: 2, title: 'Stage jeunes', date: '2026-05-20' },
  { id: 3, title: 'Galette des rois (en retard)', date: '2026-06-01' },
  { id: 4, title: 'AG annuelle', date: '2026-06-15' },
  { id: 5, title: 'Tournoi double mixte', date: '2026-07-03' },
  { id: 6, title: 'Rentrée des cours', date: '2026-09-05' },
]

const visible = computed(() => events.slice(0, props.limit ?? 10))
</script>

<template>
  <section class="event-list">
    <h2>Événements à venir</h2>
    <ul>
      <li v-for="e in visible" :key="e.id">
        <strong>{{ e.title }}</strong>
        <span class="date">{{ e.date }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.event-list ul { list-style: none; padding: 0; }
.event-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
}
.date { color: #666; font-variant-numeric: tabular-nums; }
</style>
