<script setup lang="ts">
const services = [
  {
    title: 'Mariages',
    body: `Cérémonie, réception, distribution invités. On compose en lien
direct avec ton lieu et le calendrier des fleurs disponibles
à la date — pas de catalogue figé.`,
    price: 'à partir de 1 200€',
  },
  {
    title: 'Événements professionnels',
    body: `Lancements, dîners, soirées de presse. Compositions courtes,
percutantes, redistribuables aux invités à la fin si tu le souhaites.`,
    price: 'à partir de 600€',
  },
  {
    title: 'Lieux de vie',
    body: `Boutiques, hôtels, bureaux. Abonnement mensuel ou installation
saisonnière. Mix fleurs fraîches et séchées pour limiter le gaspillage.`,
    price: 'sur devis',
  },
  {
    title: 'Éditorial & shooting',
    body: `Pour la presse, les marques, les photographes. Création sur mesure,
en studio ou sur place, avec gestion logistique complète.`,
    price: 'sur devis',
  },
]
</script>

<template>
  <div>
    <span class="section-eyebrow">Prestations</span>
    <h2>Ce que je fais — et comment</h2>
    <p style="max-width: 60ch; color: var(--brand-muted);">
      Chaque projet commence par une rencontre, jamais par un devis. On regarde
      ensemble le lieu, les volumes, le budget, la saison. La proposition arrive après.
    </p>
    <div class="services">
      <article v-for="s in services" :key="s.title" class="service-card">
        <h3>{{ s.title }}</h3>
        <p style="color: var(--brand-muted); margin: 0;">{{ s.body }}</p>
        <span class="service-card__price">{{ s.price }}</span>
      </article>
    </div>
  </div>
</template>
