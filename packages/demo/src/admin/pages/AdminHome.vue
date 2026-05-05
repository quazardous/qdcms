<script setup lang="ts">
// Placeholder admin landing rendered by qdadm's AppLayout at /admin.
// Will be replaced once entity managers are wired (Slice 3) — the
// admin home will then surface KPIs, recent activity, etc., backed by
// the same /api/qdcms/entity/* endpoints the front zone consumes.
</script>

<template>
  <div class="admin-home">
    <h1>Flower Craft — Admin</h1>
    <p>
      Welcome. The admin shell is wired into the same Vue app as the
      public site, sharing router and SignalBus with qdcms — so an
      entity edit here updates the front blocks reactively.
    </p>
    <p>
      <strong>Next:</strong> register a qdadm entity manager bound to
      <code>/api/qdcms/entity/realization</code> to drive a real CRUD
      against the in-tab backend.
    </p>
  </div>
</template>

<style scoped>
.admin-home {
  max-width: 60ch;
  margin: 2rem auto;
  padding: 1.5rem;
}
.admin-home code {
  padding: 0.1em 0.35em;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 0.25rem;
}
</style>
