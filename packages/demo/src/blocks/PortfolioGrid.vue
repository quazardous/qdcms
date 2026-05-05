<script setup lang="ts">
import { computed } from 'vue'
import { LocaleLink } from 'qdcms'
import { useDemoCollection } from '../services'
import type { Realization } from '../data/realizations'

const props = defineProps<{ limit?: number; heading?: string; lead?: string }>()

// useCollection issues a single GET /api/qdcms/entity/realization?limit=...
// against the demo-backend (or a real qdcms backend, transparent).
// `limit` becomes a query param; the composable handles loading/error
// state and refreshes on entity:created / updated / deleted signals.
const { items, loading } = useDemoCollection<Realization>('realization', {
  limit: props.limit ?? 100,
})

const ready = computed(() => !loading.value && items.value.length > 0)
</script>

<template>
  <section class="portfolio">
    <div class="portfolio__header">
      <div>
        <span class="section-eyebrow">Réalisations</span>
        <h2 v-if="heading">{{ heading }}</h2>
      </div>
      <p v-if="lead" class="portfolio__lead">{{ lead }}</p>
    </div>
    <div v-if="loading" class="portfolio__loading">Chargement…</div>
    <div v-else-if="!ready" class="portfolio__empty">Aucune réalisation à afficher.</div>
    <div v-else class="portfolio__grid">
      <LocaleLink
        v-for="r in items"
        :key="r.id"
        name="realisation"
        :params="{ slug: r.slug }"
        class="portfolio-card"
      >
        <div
          class="portfolio-card__media"
          :style="{ backgroundImage: `url(${r.thumb})` }"
        ></div>
        <div class="portfolio-card__body">
          <span class="portfolio-card__type">{{ r.type }}</span>
          <h3 class="portfolio-card__title">{{ r.title }}</h3>
          <div class="portfolio-card__meta">
            {{ r.location ?? '' }}<span v-if="r.location"> · </span>{{ r.date }}
          </div>
        </div>
      </LocaleLink>
    </div>
  </section>
</template>
