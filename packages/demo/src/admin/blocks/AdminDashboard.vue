<script setup lang="ts">
// Slice 1 — render qdadm's AppLayout as the admin block. With no
// modules registered yet, AppLayout shows an empty admin chrome
// (sidebar, topbar). The point is to validate that qdadm's plugin
// install works on our shared Vue app and that AppLayout renders.
//
// Next slice will register a qdadm module (entity manager) wired
// to /api/qdcms/entity/realization so the chrome actually shows
// real CRUD against the same backend the front zone consumes.
import { AppLayout } from 'qdadm/components'
</script>

<template>
  <AppLayout />
</template>
