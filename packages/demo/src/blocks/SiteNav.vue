<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="site-nav">
    <RouterLink to="/" class="site-nav__brand">
      <span class="site-nav__brand-mark">✿</span> Flower Craft
    </RouterLink>
    <div class="site-nav__links">
      <RouterLink to="/realisations">Réalisations</RouterLink>
      <RouterLink to="/prestations">Prestations</RouterLink>
      <RouterLink to="/demarche">Démarche</RouterLink>
      <RouterLink to="/contact">Contact</RouterLink>
    </div>
  </nav>
</template>
