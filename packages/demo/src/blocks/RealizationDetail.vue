<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { findRealization } from '../data/realizations'

const props = defineProps<{ slug?: string | null }>()
const realization = computed(() => findRealization(props.slug))
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
  <div v-else>
    <p>Réalisation introuvable. <RouterLink to="/realisations">Toutes les réalisations</RouterLink></p>
  </div>
</template>
