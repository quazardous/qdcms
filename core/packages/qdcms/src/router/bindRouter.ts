import type { Router } from 'vue-router'
import type { Cms } from '../cms/createCms'
import { declaredStackBuilder, type StackBuilder } from '../stack/StackBuilder'

export interface BindRouterOptions {
  /**
   * The StackBuilder to use. Defaults to {@link declaredStackBuilder}, which
   * reads `route.meta.stack`.
   */
  stackBuilder?: StackBuilder
  /**
   * Whether to also push the raw `route.path`, params and query to the cms
   * (for debug + escape-hatch route matching). Default: true.
   */
  syncRoute?: boolean
  /**
   * Trigger an immediate sync against the current route after wiring.
   * Default: true. Set false when the caller will trigger a navigation manually.
   */
  immediate?: boolean
}

/**
 * Wires Vue Router to the qdcms active stack.
 *
 * Pipeline:
 *   URL change → router resolves leaf → StackBuilder builds stack →
 *   cms.setStack() → composer recomputes (layout + blocks)
 *
 * @returns a teardown function that detaches the router hook.
 */
export function bindRouter(router: Router, cms: Cms, options: BindRouterOptions = {}): () => void {
  const builder = options.stackBuilder ?? declaredStackBuilder
  const syncRoute = options.syncRoute !== false
  const immediate = options.immediate !== false

  async function apply(route: import('vue-router').RouteLocationNormalized) {
    if (syncRoute) {
      cms.setRoute(
        route.path,
        route.params as Record<string, string>,
        route.query as Record<string, string | string[]>
      )
    }
    const result = builder({ route, cms })
    const stack = result instanceof Promise ? await result : result
    cms.setStack(stack)
  }

  const off = router.afterEach((to) => {
    void apply(to)
  })

  if (immediate) {
    void apply(router.currentRoute.value)
  }

  return off
}
