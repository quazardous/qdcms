/**
 * useCollection — reactive list with pagination.
 *
 * Returns refs for the items, total count, loading + error state, and
 * a refresh function. Auto-refetches when the query ref changes (deep
 * watch) or when entity signals fire for this entity.
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
import type { Query } from '@quazardous/qdcms-core/entity'
import type { ApiFrontendStorage } from '../storage/ApiFrontendStorage'

export interface UseCollectionOptions {
  storage: ApiFrontendStorage
  signals: SignalBus
  /** Fetch immediately on mount. Default: true. */
  immediate?: boolean
  /** Subscribe to entity signals and refetch on mutation. Default: true. */
  refetchOnSignal?: boolean
}

export interface UseCollectionResult<T> {
  items: Ref<T[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<Error | null>
  isReady: ComputedRef<boolean>
  refresh(): Promise<void>
}

export function useCollection<T = unknown>(
  entityName: string,
  query: Ref<Query<T> | undefined> | Query<T> | undefined,
  options: UseCollectionOptions,
): UseCollectionResult<T> {
  const queryRef: Ref<Query<T> | undefined> = isRef(query)
    ? query
    : ref(query) as Ref<Query<T> | undefined>
  const items = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const isReady = computed(() => !loading.value && error.value === null)

  const repo = options.storage.repository<T>(entityName)

  const refresh = async (): Promise<void> => {
    loading.value = true
    error.value = null
    try {
      const q = queryRef.value
      const [list, count] = await Promise.all([repo.list(q), repo.count(q)])
      items.value = list
      total.value = count
    } catch (cause) {
      error.value = cause as Error
      items.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  if (options.immediate !== false) {
    void refresh()
  }
  watch(queryRef, () => void refresh(), { deep: true })

  if (options.refetchOnSignal !== false) {
    const handler = (event: { name: string; data: unknown }) => {
      const payload = event.data as { entity?: string } | undefined
      if (!payload || payload.entity !== entityName) return
      void refresh()
    }
    const unbindCreated = options.signals.on(buildSignal('entity', SIGNAL_ACTIONS.CREATED), handler)
    const unbindUpdated = options.signals.on(buildSignal('entity', SIGNAL_ACTIONS.UPDATED), handler)
    const unbindDeleted = options.signals.on(buildSignal('entity', SIGNAL_ACTIONS.DELETED), handler)
    onScopeDispose(() => {
      unbindCreated()
      unbindUpdated()
      unbindDeleted()
    })
  }

  return { items, total, loading, error, isReady, refresh }
}
