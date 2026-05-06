/**
 * qdcms i18n routing module.
 *
 * Foundation for locale-aware routing in qdcms. Steps 1–3 of
 * `docs/i18n-routing-design.md`:
 *  - **Slug table** (`RouteSpec` / `SlugTable`) — declare routes once,
 *    expand them per locale at build time.
 *  - **`buildRoutes`** — slug table → vue-router `RouteRecordRaw[]` with
 *    `/${locale}/${slug}` paths and a `/` redirect to the default locale.
 *  - **`LocaleUrlBuilder`** — pluggable contract used everywhere a
 *    locale-aware URL is needed. `createPrefixUrlBuilder` is the default;
 *    `createDomainUrlBuilder` is ready for a future migration.
 *  - **`detectLocale`** — URL > cookie > `navigator.languages` > default.
 *  - **`LangSwitcher`** — Vue component that swaps locale, refreshes the URL
 *    via the builder, and persists the cookie.
 *
 * Translation engine itself (vue-i18n) and the qdadm SignalBus bridge are
 * later steps; not part of this module yet.
 */

export type {
  BuiltRoutes,
  Locale,
  LocaleUrlBuilder,
  RouteComponent,
  RouteSpec,
  SlugTable,
} from './types'

export {
  buildSlugPath,
  discoverLocales,
  findMissingSlugs,
  findRouteByName,
  listRouteNames,
} from './slugTable'

export { buildRoutes, type BuildRoutesOptions } from './buildRoutes'

export {
  createPrefixUrlBuilder,
  createDomainUrlBuilder,
  type PrefixUrlBuilderOptions,
  type DomainUrlBuilderOptions,
} from './urlBuilder'

export {
  detectLocale,
  matchLocaleFromUrl,
  persistLocaleCookie,
  type DetectLocaleOptions,
} from './detectLocale'

export { withLocale } from './localeAwareStackBuilder'

export { default as LangSwitcher } from '../components/i18n/LangSwitcher.vue'
