<script setup lang="ts">
defineProps<{ eyebrow?: string; body?: string }>()
</script>

<template>
  <section class="intro">
    <div v-if="eyebrow" class="intro__eyebrow">{{ eyebrow }}</div>
    <p>{{ body }}</p>
  </section>
</template>
