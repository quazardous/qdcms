<script setup lang="ts">
// Placeholder admin landing rendered at /admin. Will be replaced by
// real KPIs / recent activity / quick actions once entity managers
// are wired (Slice 3). Strictly admin-side: no commentary about the
// front zone or the IoC plumbing — that belongs in code comments,
// not in user-facing pages.
</script>

<template>
  <div class="admin-home">
    <h1>Dashboard</h1>
    <p>No data to show yet — the admin is not wired to any entity manager.</p>
  </div>
</template>

<style scoped>
.admin-home {
  max-width: 60ch;
  margin: 2rem auto;
  padding: 1.5rem;
}
</style>
