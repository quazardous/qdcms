<script setup lang="ts">
import { useRouter } from 'vue-router'
defineProps<{
  title?: string
  tagline?: string
  eyebrow?: string
  cta?: string
  ctaTo?: string
}>()
const router = useRouter()
</script>

<template>
  <section class="hero">
    <div class="hero__inner">
      <span v-if="eyebrow" class="hero__eyebrow">{{ eyebrow }}</span>
      <h1>{{ title }}</h1>
      <p v-if="tagline">{{ tagline }}</p>
      <button v-if="cta" class="hero__cta" @click="ctaTo && router.push(ctaTo)">
        {{ cta }} <span aria-hidden>→</span>
      </button>
    </div>
  </section>
</template>
