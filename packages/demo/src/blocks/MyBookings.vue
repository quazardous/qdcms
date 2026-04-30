<script setup lang="ts">
import { useCms } from 'qdcms'

const cms = useCms()
function logout() {
  cms.setAuth({ isAuthenticated: false, roles: [] })
}
</script>

<template>
  <aside class="my-bookings">
    <h3>Mes réservations</h3>
    <ul>
      <li>Court 3 — mardi 18:00</li>
      <li>Salle Yoga — jeudi 19:30</li>
    </ul>
    <button class="logout" @click="logout">Déconnexion</button>
  </aside>
</template>

<style scoped>
.my-bookings {
  padding: 1rem;
  background: #fef9c3;
  border-radius: 6px;
  font-size: 0.9rem;
}
.my-bookings ul { padding-left: 1rem; margin: 0.5rem 0; }
.logout {
  margin-top: 0.5rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  background: transparent;
  border: 1px solid #999;
  border-radius: 4px;
  cursor: pointer;
}
</style>
