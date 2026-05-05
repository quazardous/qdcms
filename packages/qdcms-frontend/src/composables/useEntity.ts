/**
 * useEntity — reactive single-row fetch.
 *
 * Returns refs you bind directly in templates:
 *   { data, loading, error, refresh, isReady }
 *
 * Auto-refreshes when:
 * - the `id` ref changes (re-fetch the new id)
 * - any `entity:updated`/`entity:deleted` signal fires for THIS entity
 *   (the data may be stale; we refetch). Filtering happens in the
 *   subscriber so other entities' changes are ignored.
 */

import {
  computed,
  isRef,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import { buildSignal, SIGNAL_ACTIONS, type SignalBus } from '@quazardous/qdcore/signal'
import type { ApiFrontendStorage } from '../storage/ApiFrontendStorage'

export interface UseEntityOptions {
  storage: ApiFrontendStorage
  signals: SignalBus
  /** Fetch immediately on mount. Default: true. */
  immediate?: boolean
  /**
   * Subscribe to `entity:updated` / `entity:deleted` signals and
   * refetch when this entity changes. Default: true.
   */
  refetchOnSignal?: boolean
}

export interface UseEntityResult<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  isReady: ComputedRef<boolean>
  refresh(): Promise<void>
}

export function useEntity<T = unknown>(
  entityName: string,
  id: Ref<string | number | null> | string | number,
  options: UseEntityOptions,
): UseEntityResult<T> {
  const idRef: Ref<string | number | null> = isRef(id) ? id : ref(id) as Ref<string | number | null>
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const isReady = computed(() => data.value !== null)

  const repo = options.storage.repository<T>(entityName)

  const refresh = async (): Promise<void> => {
    const currentId = idRef.value
    if (currentId === null || currentId === undefined) {
      data.value = null
      error.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      data.value = await repo.find(currentId)
    } catch (cause) {
      error.value = cause as Error
      data.value = null
    } finally {
      loading.value = false
    }
  }

  if (options.immediate !== false) {
    void refresh()
  }
  // Re-fetch when id changes.
  watch(idRef, () => {
    void refresh()
  })

  // Refetch on signal — but only when our entity name matches.
  if (options.refetchOnSignal !== false) {
    const handler = (event: { name: string; data: unknown }) => {
      const payload = event.data as { entity?: string; data?: { id?: string | number } } | undefined
      if (!payload || payload.entity !== entityName) return
      // For deletes, only invalidate if the id matches.
      if (event.name === buildSignal('entity', SIGNAL_ACTIONS.DELETED)) {
        const deletedId = (payload.data as { id?: string | number } | undefined)?.id
        if (deletedId !== undefined && deletedId === idRef.value) {
          data.value = null
        }
        return
      }
      // Updated/created → refresh in case our row changed.
      void refresh()
    }
    const unbindUpdated = options.signals.on(buildSignal('entity', SIGNAL_ACTIONS.UPDATED), handler)
    const unbindDeleted = options.signals.on(buildSignal('entity', SIGNAL_ACTIONS.DELETED), handler)
    onScopeDispose(() => {
      unbindUpdated()
      unbindDeleted()
    })
  }

  return { data, loading, error, isReady, refresh }
}
