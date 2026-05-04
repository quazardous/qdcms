<script setup lang="ts">
import { LocaleLink } from 'qdcms'
</script>

<template>
  <nav class="site-nav">
    <LocaleLink name="home" class="site-nav__brand">
      <span class="site-nav__brand-mark">✿</span> Flower Craft
    </LocaleLink>
    <div class="site-nav__links">
      <LocaleLink name="realisations">Réalisations</LocaleLink>
      <LocaleLink name="prestations">Prestations</LocaleLink>
      <LocaleLink name="demarche">Démarche</LocaleLink>
      <LocaleLink name="contact">Contact</LocaleLink>
    </div>
  </nav>
</template>
