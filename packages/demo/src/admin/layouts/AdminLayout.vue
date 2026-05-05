<script setup lang="ts">
import { Region } from 'qdcms'
</script>

<template>
  <div class="admin-layout">
    <main>
      <Region name="main" />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background: color-mix(in srgb, currentColor 4%, transparent);
}
</style>
