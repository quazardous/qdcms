import type { RouteLocationNormalized } from 'vue-router'
import type { Cms } from '../cms/createCms'
import type { ContentStackLevel } from '../types'

/**
 * Input passed to a StackBuilder when navigation occurs.
 *
 * `route` is the leaf identification (vue-router has resolved the URL).
 * `cms` is provided so the builder can read other context dimensions
 * (auth, tenant, locale) if it needs to.
 */
export interface StackBuilderInput {
  route: RouteLocationNormalized
  cms: Cms
}

/**
 * A StackBuilder turns a navigation event into the complete active stack.
 *
 * Conceptually:
 *   URL  →  leaf (resolved by vue-router)
 *   leaf →  full stack  ← StackBuilder's job
 *
 * The seam is explicit so multiple strategies coexist:
 *   - declarative (read `route.meta.stack`)
 *   - entity-walk (resolve parents from EntityManager FK chain)
 *   - API-based (ask backend "what does this URL represent?")
 *   - hybrid (mix and match)
 *
 * Builders may be sync or async. When async, the cms reflects the new stack
 * once the promise resolves; intermediate state is the previous stack.
 */
export type StackBuilder = (
  input: StackBuilderInput
) => ContentStackLevel[] | Promise<ContentStackLevel[]>

/**
 * Stack level template stored in `route.meta.stack` — used by the default
 * declarative builder.
 *
 * - `type` and `name` are required.
 * - `idParam`: route param name from which to read the level's `id`.
 * - `id`: literal id (use this when the id isn't from a param).
 * - `params`: any extra static metadata to carry along.
 *
 * @example
 * meta: {
 *   stack: [
 *     { type: 'collection', name: 'events' },
 *     { type: 'item', name: 'event', idParam: 'slug' }
 *   ] satisfies StackLevelMetaTemplate[]
 * }
 */
export interface StackLevelMetaTemplate {
  type: string
  name: string
  idParam?: string
  id?: string | null
  params?: Record<string, unknown>
}

/**
 * Default StackBuilder: reads `route.meta.stack` (an array of {@link StackLevelMetaTemplate})
 * and resolves any `idParam` against `route.params`.
 *
 * Synchronous, zero dependencies on entities — works for any "from-scratch" CMS.
 */
export const declaredStackBuilder: StackBuilder = ({ route }) => {
  const meta = (route.meta?.stack ?? null) as StackLevelMetaTemplate[] | null
  if (!meta) return []
  return meta.map((t) => ({
    type: t.type,
    name: t.name,
    id: t.idParam
      ? ((route.params[t.idParam] as string | undefined) ?? null)
      : (t.id ?? null),
    params: t.params,
  }))
}
