import {
  reactive,
  shallowRef,
  ref,
  watch,
  type Ref,
  type App,
  type InjectionKey,
} from 'vue'
import { I18N_SIGNALS, createSignalBus, type SignalBus } from '@quazardous/qdcore'
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
import type { LocaleUrlBuilder } from '../i18n/types'
import { BlockRegistry } from '../blocks/BlockRegistry'
import { PlacementRegistry } from '../blocks/PlacementRegistry'
import { LayoutRegistry } from '../layouts/LayoutRegistry'
import { DefaultPageComposer } from '../composer/PageComposer'

/**
 * Public signal names emitted by `cms.signals`. Consumers can subscribe via
 * `cms.signals.on(CMS_SIGNALS.PAGE_COMPOSED, …)`.
 *
 * Locale signals come from `@quazardous/qdcore`'s `I18N_SIGNALS` so qdadm and
 * qdcms speak the same vocabulary in mono-app setups.
 */
export const CMS_SIGNALS = {
  STACK_CHANGED: 'cms:stack-changed',
  ROUTE_CHANGED: 'cms:route-changed',
  AUTH_CHANGED: 'cms:auth-changed',
  TENANT_CHANGED: 'cms:tenant-changed',
  PAGE_COMPOSED: 'cms:page-composed',
} as const

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
  /**
   * Existing `SignalBus` to use instead of creating a fresh one. Pass the
   * same instance when mounting alongside qdadm so both sides cross-talk
   * (e.g. for the i18n bridge).
   */
  signals?: SignalBus
  /**
   * Locale-aware URL builder. Required for `<LocaleLink>` and
   * `useLocaleUrl()` to function. May also be set after construction via
   * `cms.setUrlBuilder(...)` (typical when the slug table lives in a sibling
   * module that imports `cms` itself). Hardcoded paths in qdcms code are
   * structurally forbidden — every URL goes through this builder.
   */
  urlBuilder?: LocaleUrlBuilder
}

export interface Cms {
  blocks: BlockRegistry
  placements: PlacementRegistry
  layouts: LayoutRegistry
  /** Read-only access to the active composer. Use `setComposer()` to replace. */
  readonly composer: PageComposer
  /**
   * Generic event bus shared with qdadm and any other consumer. See
   * {@link CMS_SIGNALS} for built-in signal names; emit your own freely.
   * Always present (never `undefined`) — central mechanism by design.
   */
  signals: SignalBus
  /**
   * Active locale-aware URL builder. Read by `<LocaleLink>` and
   * `useLocaleUrl()`. May be `null` only during the brief window between
   * `createCms()` and `cms.setUrlBuilder()` — both navigation primitives
   * throw on use while it's null, by design (hardcoded paths are forbidden).
   */
  readonly urlBuilder: Ref<LocaleUrlBuilder | null>
  /** Replace the active URL builder. */
  setUrlBuilder(builder: LocaleUrlBuilder | null): void
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
  const signals = options.signals ?? createSignalBus()
  const urlBuilder = shallowRef<LocaleUrlBuilder | null>(options.urlBuilder ?? null)

  const context = reactive<CmsContext>({
    stack: [],
    route: '/',
    params: {},
    query: {},
    auth: options.initialAuth ?? { isAuthenticated: false, roles: [] },
    tenant: options.initialTenant,
    locale: options.initialLocale,
  })

  // Listen for external `locale:change` requests (e.g. from a sibling qdadm
  // or a programmatic UI). The setLocale() setter below also emits
  // `locale:changed` so anyone listening to the bus stays in sync.
  signals.on(I18N_SIGNALS.LOCALE_CHANGE, (event) => {
    const next = typeof event.data === 'string' ? event.data : null
    if (next && next !== context.locale) {
      context.locale = next
      bump()
      void signals.emit(I18N_SIGNALS.LOCALE_CHANGED, next)
    }
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
            if (mySeq === resolveSeq) {
              composedPage.value = page
              void signals.emit(CMS_SIGNALS.PAGE_COMPOSED, page)
            }
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
        void signals.emit(CMS_SIGNALS.PAGE_COMPOSED, result)
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
    signals,
    urlBuilder,
    setUrlBuilder(builder) {
      urlBuilder.value = builder
    },
    context,
    composedPage,
    composing,
    setRoute(route, params = {}, query = {}) {
      context.route = route
      context.params = params
      context.query = query
      bump()
      void signals.emit(CMS_SIGNALS.ROUTE_CHANGED, { route, params, query })
    },
    setStack(stack) {
      context.stack = stack
      bump()
      void signals.emit(CMS_SIGNALS.STACK_CHANGED, { levels: stack })
    },
    setAuth(auth) {
      context.auth = auth
      bump()
      void signals.emit(CMS_SIGNALS.AUTH_CHANGED, auth)
    },
    setTenant(tenant) {
      context.tenant = tenant
      bump()
      void signals.emit(CMS_SIGNALS.TENANT_CHANGED, tenant)
    },
    setLocale(locale) {
      context.locale = locale
      bump()
      if (locale) void signals.emit(I18N_SIGNALS.LOCALE_CHANGED, locale)
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
