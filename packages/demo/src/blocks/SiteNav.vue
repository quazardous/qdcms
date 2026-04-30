<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="site-nav">
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="/events">Events</RouterLink>
    <RouterLink to="/courts">Courts</RouterLink>
    <RouterLink to="/me">My space</RouterLink>
  </nav>
</template>

<style scoped>
.site-nav {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: #f4f4f4;
}
.site-nav a {
  text-decoration: none;
  color: #333;
}
.site-nav a.router-link-active {
  font-weight: bold;
  color: #2563eb;
}
</style>
