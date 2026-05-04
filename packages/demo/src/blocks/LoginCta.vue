<script setup lang="ts">
import { useCms, useLocaleUrl } from 'qdcms'
import { useRouter } from 'vue-router'

const cms = useCms()
const router = useRouter()
const urlFor = useLocaleUrl()

function fakeLogin() {
  cms.setAuth({
    isAuthenticated: true,
    roles: ['ROLE_CLIENT'],
    userId: 'juliette',
  })
  // Redirect to pro space to make the auth flip visible
  void router.push(urlFor('me'))
}
</script>

<template>
  <button class="login-cta" @click="fakeLogin">
    Espace client
  </button>
</template>
