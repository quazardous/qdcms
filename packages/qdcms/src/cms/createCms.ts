import {
  reactive,
  shallowRef,
  ref,
  watch,
  type Ref,
  type App,
  type InjectionKey,
} from 'vue'
import type {
  AuthSnapshot,
  BlockDefinition,
  CmsContext,
  ComposedPage,
  ContentStackLevel,
  LayoutDefinition,
  PageComposer,
  Placement,
} from '../types'
import { BlockRegistry } from '../blocks/BlockRegistry'
import { PlacementRegistry } from '../blocks/PlacementRegistry'
import { LayoutRegistry } from '../layouts/LayoutRegistry'
import { DefaultPageComposer } from '../composer/PageComposer'

export interface CreateCmsOptions {
  /** Replace the default block resolver. Receives the registries. */
  composer?: (
    blocks: BlockRegistry,
    placements: PlacementRegistry,
    layouts: LayoutRegistry
  ) => PageComposer
  /** Initial auth snapshot. Update via `cms.setAuth()`. */
  initialAuth?: AuthSnapshot
  initialTenant?: string
  initialLocale?: string
}

export interface Cms {
  blocks: BlockRegistry
  placements: PlacementRegistry
  layouts: LayoutRegistry
  /** Read-only access to the active composer. Use `setComposer()` to replace. */
  readonly composer: PageComposer
  context: CmsContext
  /**
   * The composed page for the current context. Re-evaluates whenever context,
   * registries or composer change. Async composers are supported — stale
   * results are discarded.
   */
  composedPage: Ref<ComposedPage | null>
  /** True while the composer is resolving (relevant for async composers). */
  composing: Ref<boolean>
  setRoute(
    route: string,
    params?: Record<string, string>,
    query?: Record<string, string | string[]>
  ): void
  /** Replace the active navigation stack (the primary matching surface). */
  setStack(stack: ContentStackLevel[]): void
  setAuth(auth: AuthSnapshot): void
  setTenant(tenant: string | undefined): void
  setLocale(locale: string | undefined): void
  setComposer(composer: PageComposer): void
  /** Sugar: register a block. */
  block(name: string, def: BlockDefinition): Cms
  /** Sugar: place a previously-registered block. */
  place(blockName: string, placement: Omit<Placement, 'block'>): Cms
  /** Sugar: register a layout. */
  layout(
    name: string,
    def: LayoutDefinition['component'] | LayoutDefinition,
    regions?: string[]
  ): Cms
  install(app: App): void
}

export const CMS_INJECTION: InjectionKey<Cms> = Symbol('qdcms')

export function createCms(options: CreateCmsOptions = {}): Cms {
  const blocks = new BlockRegistry()
  const placements = new PlacementRegistry()
  const layouts = new LayoutRegistry()

  const context = reactive<CmsContext>({
    stack: [],
    route: '/',
    params: {},
    query: {},
    auth: options.initialAuth ?? { isAuthenticated: false, roles: [] },
    tenant: options.initialTenant,
    locale: options.initialLocale,
  })

  const composerRef = shallowRef<PageComposer>(
    options.composer
      ? options.composer(blocks, placements, layouts)
      : new DefaultPageComposer(blocks, placements, { layouts })
  )

  const composedPage = ref<ComposedPage | null>(null)
  const composing = ref(false)

  // Revision counter: any setX() bumps it, ensuring the compose watcher fires
  // even when the composer doesn't read the relevant ctx field. This makes the
  // recompute trigger predictable for users (no surprise "my setLocale didn't
  // re-run compose because compose ignores locale").
  const ctxRev = ref(0)
  const bump = () => ctxRev.value++

  let resolveSeq = 0

  // Source: a getter that calls compose() synchronously. Vue tracks reactive
  // reads here (composerRef + ctxRev + whatever compose() reads on its own).
  // Result may be a Promise — we await in the handler with a sequence token to
  // discard stale resolutions (race-safe).
  watch(
    () => {
      void ctxRev.value
      return composerRef.value.compose(context)
    },
    (result) => {
      const mySeq = ++resolveSeq
      if (result instanceof Promise) {
        composing.value = true
        result
          .then((page) => {
            if (mySeq === resolveSeq) composedPage.value = page
          })
          .catch((err) => {
            if (mySeq === resolveSeq) {
              console.error('[qdcms] composer rejected:', err)
              composedPage.value = null
            }
          })
          .finally(() => {
            if (mySeq === resolveSeq) composing.value = false
          })
      } else {
        composedPage.value = result
        composing.value = false
      }
    },
    { immediate: true }
  )

  const cms: Cms = {
    blocks,
    placements,
    layouts,
    get composer() {
      return composerRef.value
    },
    context,
    composedPage,
    composing,
    setRoute(route, params = {}, query = {}) {
      context.route = route
      context.params = params
      context.query = query
      bump()
    },
    setStack(stack) {
      context.stack = stack
      bump()
    },
    setAuth(auth) {
      context.auth = auth
      bump()
    },
    setTenant(tenant) {
      context.tenant = tenant
      bump()
    },
    setLocale(locale) {
      context.locale = locale
      bump()
    },
    setComposer(c) {
      composerRef.value = c
    },
    block(name, def) {
      blocks.register(name, def)
      return cms
    },
    place(blockName, placement) {
      placements.add({ block: blockName, ...placement })
      return cms
    },
    layout(name, defOrComponent, regions) {
      layouts.register(name, defOrComponent, regions)
      return cms
    },
    install(app: App) {
      app.provide(CMS_INJECTION, cms)
    },
  }

  return cms
}
