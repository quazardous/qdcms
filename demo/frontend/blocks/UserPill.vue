<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LocaleLink, useCms, useLocaleUrl } from 'qdcms'

const cms = useCms()
const router = useRouter()
const urlFor = useLocaleUrl()

const initial = computed(() => {
  const id = cms.context.auth.userId ?? 'U'
  return id.charAt(0).toUpperCase()
})
const name = computed(() => {
  const id = cms.context.auth.userId
  if (!id) return 'Invitée'
  return id.charAt(0).toUpperCase() + id.slice(1)
})

function logout() {
  cms.setAuth({ isAuthenticated: false, roles: [] })
  void router.push(urlFor('home'))
}
</script>

<template>
  <div class="user-pill">
    <LocaleLink name="me" class="user-pill__avatar" :aria-label="`Espace de ${name}`">
      {{ initial }}
    </LocaleLink>
    <button class="user-pill__logout" @click="logout">Déconnexion</button>
  </div>
</template>
