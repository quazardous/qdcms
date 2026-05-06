<script setup lang="ts">
const projects = [
  {
    id: 'mariage-2026-09',
    title: 'Mariage Juliette × Thomas',
    meta: 'Domaine de la Garde · 12 septembre 2026',
    status: 'En préparation',
    statusType: 'progress',
  },
  {
    id: 'event-soiree-presse',
    title: 'Soirée presse — collection automne',
    meta: 'Galerie Lumière · 18 octobre 2026',
    status: 'Devis envoyé',
    statusType: 'progress',
  },
  {
    id: 'archive-2025-06',
    title: 'Anniversaire 40 ans',
    meta: 'À domicile · 22 juin 2025',
    status: 'Livré',
    statusType: 'done',
  },
] as const
</script>

<template>
  <section>
    <span class="section-eyebrow">Mes projets</span>
    <h2>3 projets — 2 à venir</h2>
    <div class="my-projects" style="margin-top: 2rem;">
      <article v-for="p in projects" :key="p.id" class="project-card">
        <div class="project-card__accent"></div>
        <div>
          <h3 class="project-card__title">{{ p.title }}</h3>
          <div class="project-card__meta">{{ p.meta }}</div>
        </div>
        <span
          class="project-card__status"
          :class="{ 'project-card__status--done': p.statusType === 'done' }"
        >{{ p.status }}</span>
      </article>
    </div>
  </section>
</template>
