<script setup lang="ts">
import { computed } from 'vue'
import { useCms } from '../composables/useCms'

const props = defineProps<{
  name: string
}>()

const cms = useCms()

const blocks = computed(() => {
  const page = cms.composedPage.value
  if (!page) return []
  return page.regions[props.name] ?? []
})
</script>

<template>
  <div class="qdcms-region" :data-region="name">
    <component
      v-for="b in blocks"
      :key="b.id"
      :is="b.component"
      v-bind="b.props"
    />
  </div>
</template>
