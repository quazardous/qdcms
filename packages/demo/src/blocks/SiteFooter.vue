<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <div>
        <div class="site-footer__brand">Flower Craft</div>
        <p style="max-width: 35ch; opacity: 0.85;">
          Compositions florales locales et de saison, pour mariages, événements et lieux de vie.
        </p>
      </div>
      <div class="site-footer__col">
        <h4>Atelier</h4>
        <ul>
          <li><RouterLink to="/realisations">Réalisations</RouterLink></li>
          <li><RouterLink to="/prestations">Prestations</RouterLink></li>
          <li><RouterLink to="/demarche">Démarche éco</RouterLink></li>
        </ul>
      </div>
      <div class="site-footer__col">
        <h4>Visite</h4>
        <ul>
          <li>12 rue des Pivoines</li>
          <li>33000 Bordeaux</li>
          <li>du mardi au samedi</li>
          <li>10h–13h · 15h–19h</li>
        </ul>
      </div>
    </div>
    <div class="site-footer__legal">
      © 2026 Flower Craft — propulsé par <a href="https://github.com/quazardous/qdcms" target="_blank" rel="noopener">qdcms</a>
    </div>
  </footer>
</template>
