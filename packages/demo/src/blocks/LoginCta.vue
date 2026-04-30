<script setup lang="ts">
import { useCms } from 'qdcms'
import { useRouter } from 'vue-router'

const cms = useCms()
const router = useRouter()

function fakeLogin() {
  cms.setAuth({
    isAuthenticated: true,
    roles: ['ROLE_CLIENT'],
    userId: 'juliette',
  })
  // Redirect to pro space to make the auth flip visible
  router.push('/me')
}
</script>

<template>
  <button class="login-cta" @click="fakeLogin">
    Espace client
  </button>
</template>
