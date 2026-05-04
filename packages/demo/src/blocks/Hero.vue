<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useLocaleUrl } from 'qdcms'

const props = defineProps<{
  title?: string
  tagline?: string
  eyebrow?: string
  cta?: string
  /** Logical route name to navigate to on CTA click. */
  ctaName?: string
  /** Optional params for the CTA route. */
  ctaParams?: Record<string, string | number>
}>()
const router = useRouter()
const urlFor = useLocaleUrl()

function onCta(): void {
  if (!props.ctaName) return
  void router.push(urlFor(props.ctaName, props.ctaParams))
}
</script>

<template>
  <section class="hero">
    <div class="hero__inner">
      <span v-if="eyebrow" class="hero__eyebrow">{{ eyebrow }}</span>
      <h1>{{ title }}</h1>
      <p v-if="tagline">{{ tagline }}</p>
      <button v-if="cta && ctaName" class="hero__cta" @click="onCta">
        {{ cta }} <span aria-hidden>→</span>
      </button>
    </div>
  </section>
</template>
