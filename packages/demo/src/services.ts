/**
 * Demo runtime services — the ApiFrontendStorage singleton and thin
 * wrappers around useEntity / useCollection that pre-bind it to the
 * demo's CMS SignalBus.
 *
 * Components don't need to know about the storage instance or the
 * signals — they just call `useDemoEntity('realization', slug)` /
 * `useDemoCollection('realization', { limit: 3 })`.
 */

import { ApiFrontendStorage } from '@quazardous/qdcms-frontend'
import {
  useCollection,
  useEntity,
  type UseCollectionResult,
  type UseEntityResult,
} from '@quazardous/qdcms-frontend/composables'
import type { Query } from '@quazardous/qdcms-core/entity'
import type { Ref } from 'vue'
import { cms } from './cms-instance'

export const apiStorage = new ApiFrontendStorage({
  baseUrl: '/api/qdcms',
  signals: cms.signals,
})

export function useDemoEntity<T>(
  entityName: string,
  id: Ref<string | number | null> | string | number,
): UseEntityResult<T> {
  return useEntity<T>(entityName, id, {
    storage: apiStorage,
    signals: cms.signals,
  })
}

export function useDemoCollection<T>(
  entityName: string,
  query?: Ref<Query<T> | undefined> | Query<T>,
): UseCollectionResult<T> {
  return useCollection<T>(entityName, query, {
    storage: apiStorage,
    signals: cms.signals,
  })
}
