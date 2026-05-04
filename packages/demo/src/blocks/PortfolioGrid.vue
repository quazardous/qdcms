<script setup lang="ts">
import { computed } from 'vue'
import { LocaleLink } from 'qdcms'
import { realizations } from '../data/realizations'

const props = defineProps<{ limit?: number; heading?: string; lead?: string }>()

const items = computed(() => realizations.slice(0, props.limit ?? 100))
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
    <div class="portfolio__grid">
      <LocaleLink
        v-for="r in items"
        :key="r.slug"
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
