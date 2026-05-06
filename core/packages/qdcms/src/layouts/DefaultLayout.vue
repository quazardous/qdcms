<script setup lang="ts">
import Region from '../components/Region.vue'
</script>

<template>
  <div class="qdcms-layout qdcms-layout--default">
    <header class="qdcms-layout__header">
      <Region name="header" />
    </header>
    <div class="qdcms-layout__body">
      <main class="qdcms-layout__main">
        <Region name="main" />
      </main>
      <aside class="qdcms-layout__aside">
        <Region name="aside" />
      </aside>
    </div>
    <footer class="qdcms-layout__footer">
      <Region name="footer" />
    </footer>
  </div>
</template>
