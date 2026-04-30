import type { Component } from 'vue'

/**
 * The runtime context against which block placement conditions are evaluated.
 *
 * The **stack** (ActiveStack) is the primary matching surface — it represents
 * what the user is currently navigating through, derived from the URL via the
 * router meta (or any custom resolver).
 *
 * `route` and `params` are kept as raw inputs for edge cases and debug, but
 * placement should prefer matching against `stack`.
 *
 * **Extending**: declare additional context dimensions via TypeScript module
 * augmentation:
 *
 * ```ts
 * declare module 'qdcms' {
 *   interface CmsContext { ab_variant?: string }
 * }
 * ```
 */
export interface CmsContext {
  /** Active navigation stack — the structured reading of the current URL. */
  stack: ContentStackLevel[]
  /** Raw URL path (escape hatch — prefer `stack` for matching). */
  route: string
  params: Record<string, string>
  query: Record<string, string | string[]>
  auth: AuthSnapshot
  tenant?: string
  locale?: string
}

/**
 * One level of the active stack.
 *
 * `type` is open-ended (string) so projects can introduce new kinds:
 *   - 'collection' — a list of an entity ('events', 'courts')
 *   - 'item'       — a single item of an entity (with id)
 *   - 'page'       — a static-ish page ('home', 'about', 'me')
 *   - 'view'       — a specific view of something ('calendar', 'map')
 *   - 'custom'     — anything project-specific
 */
export interface ContentStackLevel {
  type: string
  name: string
  id?: string | null
  params?: Record<string, unknown>
}

export interface AuthSnapshot {
  isAuthenticated: boolean
  roles: string[]
  userId?: string | null
}

/**
 * A block is a Vue component plus metadata.
 * Blocks are registered once; placements declare where instances appear.
 */
export interface BlockDefinition<P extends object = object> {
  component: Component
  /** Optional schema for editor tooling (props the block accepts). */
  schema?: BlockSchema<P>
  /**
   * Cache/visibility scope for the block's data.
   * Affects which storages it should consume and whether the rendered output is cacheable.
   */
  scope?: BlockScope
}

export type BlockScope = 'public' | 'authenticated' | 'anonymous-only' | string

export type BlockSchema<P extends object = object> = {
  [K in keyof P]: BlockSchemaField
}

export interface BlockSchemaField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'json'
  label?: string
  default?: unknown
  required?: boolean
  options?: Array<{ label: string; value: unknown }>
}

/**
 * A placement says: "this block should appear in `region` of the current page
 * when the context matches `when`".
 *
 * `props` may be a static record OR a function that receives the current
 * context — useful when a block needs context-derived props without coupling
 * the block component to the cms context (keeps blocks reusable).
 */
export interface Placement {
  block: string
  region: string
  weight?: number
  /** Conditions evaluated against CmsContext. Empty = always match. */
  when?: PlacementConditions
  /** Static props OR a resolver receiving the active context. */
  props?: PlacementProps | PlacementPropsResolver
  /**
   * Optional id for this placement instance (useful when the same block is
   * placed multiple times with different props).
   */
  id?: string
}

export type PlacementProps = Record<string, unknown>
export type PlacementPropsResolver = (ctx: CmsContext) => PlacementProps

/**
 * Placement conditions. All conditions must pass (AND).
 * Each value can be a literal, a list (OR), or a predicate function.
 *
 * Prefer `stack` over `route` — `route` is an escape hatch for non-semantic cases.
 */
export interface PlacementConditions {
  /** Match against the active navigation stack — the recommended primary matcher. */
  stack?: StackCondition
  /** Raw route matching (escape hatch — prefer `stack`). */
  route?: RouteCondition
  /** Require authenticated (true) or anonymous (false). Omit for "don't care". */
  auth?: boolean
  roles?: string | string[] | ((roles: string[]) => boolean)
  tenant?: string | string[]
  locale?: string | string[]
  /** Fully custom predicate, evaluated last. */
  predicate?: (ctx: CmsContext) => boolean
}

/**
 * Stack matching options.
 * - `top`      : the deepest level (the "current" thing) must match this template
 * - `contains` : at least one level in the stack matches this template
 * - `depth`    : exact depth or { min, max }
 * - `empty`    : true ⇒ stack is empty; false ⇒ stack is non-empty
 *
 * A "template" is a partial level: every defined field must equal the level's field.
 */
export interface StackCondition {
  top?: StackLevelTemplate
  contains?: StackLevelTemplate
  depth?: number | { min?: number; max?: number }
  empty?: boolean
}

export type StackLevelTemplate = Partial<Pick<ContentStackLevel, 'type' | 'name' | 'id'>>

/**
 * Route condition:
 * - exact string ('/events')
 * - glob with * ('/events/*')
 * - prefix with trailing /* ('/admin/*')
 * - RegExp
 * - array (OR)
 * - function (custom)
 */
export type RouteCondition =
  | string
  | string[]
  | RegExp
  | ((route: string) => boolean)

/**
 * A resolved instance ready for rendering.
 */
export interface ResolvedBlock {
  id: string
  block: string
  component: Component
  props: Record<string, unknown>
  weight: number
  scope?: BlockScope
}

/**
 * The output of a PageComposer for a given context.
 */
export interface ComposedPage {
  layout: string
  regions: Record<string, ResolvedBlock[]>
}

/**
 * Pluggable composer contract.
 */
export interface PageComposer {
  compose(context: CmsContext): ComposedPage | Promise<ComposedPage>
}

export interface LayoutDefinition {
  component: Component
  /** Names of regions this layout exposes (used for editor tooling and validation). */
  regions: string[]
}
