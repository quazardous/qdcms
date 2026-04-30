<script setup lang="ts">
defineProps<{
  title?: string
  tagline?: string
}>()
</script>

<template>
  <div class="hero">
    <h1>{{ title }}</h1>
    <p v-if="tagline">{{ tagline }}</p>
  </div>
</template>

<style scoped>
.hero {
  padding: 3rem 1rem;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  color: white;
  text-align: center;
}
.hero h1 {
  margin: 0 0 0.5rem;
  font-size: 2.5rem;
}
</style>
