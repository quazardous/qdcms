<script setup lang="ts">
import { computed } from 'vue'
import { useCms } from 'qdcms'

const cms = useCms()
const name = computed(() => {
  const id = cms.context.auth.userId
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Invitée'
})
</script>

<template>
  <section class="pro-welcome">
    <div class="pro-welcome__eyebrow">Espace client</div>
    <h2>Bonjour {{ name }} —</h2>
    <p style="color: var(--brand-muted); max-width: 50ch; margin: 0;">
      Tu retrouves ici tes projets en cours, leur planning et les fichiers
      partagés (moodboard, devis, factures). On reste joignables par message ici
      ou par téléphone.
    </p>
  </section>
</template>
