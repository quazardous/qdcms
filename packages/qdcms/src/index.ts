// qdcms — block-centric public framework

export * from './types'

export { BlockRegistry } from './blocks/BlockRegistry'
export { PlacementRegistry } from './blocks/PlacementRegistry'
export { matchConditions, matchRoute, matchStack, matchStackLevel } from './blocks/matchers'

export {
  declaredStackBuilder,
  type StackBuilder,
  type StackBuilderInput,
  type StackLevelMetaTemplate,
} from './stack/StackBuilder'

export { bindRouter, type BindRouterOptions } from './router/bindRouter'

export { LayoutRegistry } from './layouts/LayoutRegistry'

export {
  DefaultPageComposer,
  ApiPageComposer,
  OverlayPageComposer,
} from './composer/PageComposer'

export { createCms, CMS_INJECTION, type Cms, type CreateCmsOptions } from './cms/createCms'

export { useCms } from './composables/useCms'

export { default as PageRenderer } from './components/PageRenderer.vue'
export { default as Region } from './components/Region.vue'
export { default as DefaultLayout } from './layouts/DefaultLayout.vue'

// i18n routing — see docs/i18n-routing-design.md
export {
  LangSwitcher,
  buildRoutes,
  buildSlugPath,
  createDomainUrlBuilder,
  createPrefixUrlBuilder,
  detectLocale,
  discoverLocales,
  findMissingSlugs,
  findRouteByName,
  listRouteNames,
  matchLocaleFromUrl,
  persistLocaleCookie,
  type BuildRoutesOptions,
  type BuiltRoutes,
  type DetectLocaleOptions,
  type DomainUrlBuilderOptions,
  type Locale,
  type LocaleUrlBuilder,
  type PrefixUrlBuilderOptions,
  type RouteComponent,
  type RouteSpec,
  type SlugTable,
} from './i18n'
