<script setup lang="ts">
import { ref } from 'vue'

const submitted = ref(false)
function onSubmit(e: Event) {
  e.preventDefault()
  submitted.value = true
}
</script>

<template>
  <div>
    <span class="section-eyebrow">Contact</span>
    <h2>Discutons de ton projet.</h2>
    <p style="color: var(--brand-muted); max-width: 55ch;">
      Réponse sous 48h. Pas de devis automatique, pas de configurateur :
      on échange d'abord, le chiffrage vient ensuite.
    </p>
    <div class="contact">
      <div class="contact__info">
        <strong>Atelier</strong>
        <p>12 rue des Pivoines<br>33000 Bordeaux</p>
        <strong>Horaires</strong>
        <p>Mardi–samedi · 10h–13h · 15h–19h</p>
        <strong>Email</strong>
        <p><a href="mailto:hello@flowercraft.fr">hello@flowercraft.fr</a></p>
        <strong>Téléphone</strong>
        <p>05 56 00 00 00</p>
      </div>
      <form class="contact__form" @submit="onSubmit">
        <label>
          Nom
          <input type="text" required placeholder="Ton nom" />
        </label>
        <label>
          Email
          <input type="email" required placeholder="ton@email.fr" />
        </label>
        <label>
          Type de projet
          <input type="text" placeholder="Mariage, événement, vitrine…" />
        </label>
        <label>
          Date approximative
          <input type="text" placeholder="Été 2026, ou juin 2027…" />
        </label>
        <label>
          Le projet en quelques mots
          <textarea rows="4" placeholder="Lieu, ambiance, contraintes — tout est utile."></textarea>
        </label>
        <button type="submit">Envoyer</button>
        <p v-if="submitted" style="color: var(--brand-warm); font-weight: 500;">
          ✓ Message reçu (démo — rien n'est envoyé)
        </p>
      </form>
    </div>
  </div>
</template>
