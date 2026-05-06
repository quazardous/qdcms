<script setup lang="ts">
const pillars = [
  {
    icon: '🌱',
    title: 'Local, vraiment',
    body: `90% des fleurs viennent de producteurs à moins de 200 km.
Le reste est sourcé chez des collègues qui ont les mêmes critères.`,
  },
  {
    icon: '🗓️',
    title: 'De saison, sans triche',
    body: `Pas de roses en janvier, pas de pivoines en novembre.
La saison décide du langage — c'est aussi ce qui rend chaque projet unique.`,
  },
  {
    icon: '♻️',
    title: 'Zéro mousse, zéro plastique',
    body: `Compositions tenues par des structures réutilisables.
Vases en consigne, dépôt-retour à l'atelier.`,
  },
  {
    icon: '🪴',
    title: 'Rien ne se jette',
    body: `Fin de mariage : redistribution invités ou maisons de retraite.
Fin d'événement : composition redécomposée pour la boutique.`,
  },
]
</script>

<template>
  <article class="demarche">
    <span class="section-eyebrow">Démarche</span>
    <h2>Belle, et défendable.</h2>
    <p style="font-size: 1.1rem; color: var(--brand-muted); line-height: 1.7;">
      L'industrie florale tient le triste record du transport mondial de denrées
      fraîches. Chez Flower Craft, chaque choix est un compromis assumé entre
      ce qui est beau, ce qui est local, et ce qui ne pèse pas trop sur le climat.
    </p>
    <div class="demarche__pillars">
      <div v-for="p in pillars" :key="p.title" class="pillar">
        <div class="pillar__icon" aria-hidden>{{ p.icon }}</div>
        <h3>{{ p.title }}</h3>
        <p>{{ p.body }}</p>
      </div>
    </div>
  </article>
</template>
