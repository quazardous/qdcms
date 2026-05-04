<script setup lang="ts">
/**
 * StatePanel — renders a state-only collector's `snapshot().state` as a tree.
 *
 * State-only collectors (records=false) don't have entries — they expose a
 * single live state object via `snapshot().state`. qddebug's default fallback
 * shows "No entries" for them, which is misleading. This panel dumps the
 * snapshot state via the bundled ObjectTree.
 *
 * Reactivity: re-snapshots whenever the bridge tick advances. Avoids hooking
 * the collector's per-tick refresh directly so the panel stays generic.
 */
import { computed, inject } from 'vue'
import { ObjectTree } from '@quazardous/qddebug'

interface CollectorWithSnapshot {
  snapshot: () => { state?: Record<string, unknown> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _bridge?: { tick?: { value: number }; [key: string]: any } | null
}

const props = defineProps<{
  collector: CollectorWithSnapshot
}>()

const tick = computed(() => props.collector._bridge?.tick?.value ?? 0)
const state = computed(() => {
  void tick.value // force re-eval on bridge tick
  return props.collector.snapshot().state ?? {}
})
</script>

<template>
  <div class="state-panel">
    <ObjectTree :data="state" :expanded="true" :max-depth="6" />
  </div>
</template>

<style scoped>
.state-panel {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, monospace;
  overflow: auto;
  height: 100%;
  background: #18181b;
  color: #d1d5db;
}
</style>
