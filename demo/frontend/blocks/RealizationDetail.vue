<script setup lang="ts">
import { computed } from 'vue'
import { LocaleLink } from 'qdcms'
import { useDemoEntity } from '../services'
import type { Realization } from '../content/realizations'

const props = defineProps<{ slug?: string | null }>()

// id == slug for realizations (see realizationSeed). Passing a
// computed ref so useEntity refetches automatically when the route
// slug changes (e.g. user navigates to a different realization).
const id = computed<string | number | null>(() => props.slug ?? null)
const { data: realization, loading } = useDemoEntity<Realization>(
  'realization',
  id,
)
</script>

<template>
  <article v-if="realization" class="realization">
    <div
      class="realization__hero"
      :style="{ backgroundImage: `url(${realization.image})` }"
    ></div>
    <div class="realization__type">{{ realization.type }}</div>
    <h1>{{ realization.title }}</h1>
    <div class="realization__meta">
      {{ realization.location ?? '' }}<span v-if="realization.location"> · </span>{{ realization.date }}
    </div>
    <div class="realization__body" style="white-space: pre-line;">{{ realization.body }}</div>
  </article>
  <div v-else-if="loading">
    <p>Chargement…</p>
  </div>
  <div v-else>
    <p>Réalisation introuvable. <LocaleLink name="realisations">Toutes les réalisations</LocaleLink></p>
  </div>
</template>
