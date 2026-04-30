<script setup lang="ts">
import { useCms } from 'qdcms'

const cms = useCms()

function fakeLogin() {
  cms.setAuth({ isAuthenticated: true, roles: ['ROLE_MEMBER'], userId: 'demo-user' })
}
</script>

<template>
  <button class="login-cta" @click="fakeLogin">Se connecter</button>
</template>

<style scoped>
.login-cta {
  padding: 0.4rem 0.8rem;
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
</style>
