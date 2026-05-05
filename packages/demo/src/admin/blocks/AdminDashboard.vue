<script setup lang="ts">
// Placeholder admin landing. The real admin will live under qdadm and
// progressively replace this block; for now it just proves the route +
// CMS wiring works end-to-end with Option B turned on.
</script>

<template>
  <section class="admin-dashboard">
    <header class="admin-dashboard__head">
      <small>qdcms · admin</small>
      <h1>Admin Dashboard</h1>
    </header>
    <p>
      Admin landing — placeholder. The real admin will live under
      qdadm and progressively replace this block. Today this proves
      the route + CMS wiring works end-to-end at <code>/admin</code>
      with its own layout (no public chrome, no locale prefix).
    </p>
    <p>
      Next step: plug qdadm here, or extend with admin-only blocks
      that consume the same <code>useDemoCollection</code> /
      <code>useDemoEntity</code> chain as the public site.
    </p>
  </section>
</template>

<style scoped>
.admin-dashboard {
  max-width: 60ch;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 0.5rem;
}
.admin-dashboard__head small {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
}
.admin-dashboard__head h1 {
  margin: 0.25rem 0 1rem;
}
.admin-dashboard code {
  padding: 0.1em 0.35em;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 0.25rem;
  font-size: 0.92em;
}
</style>
