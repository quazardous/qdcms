/**
 * qdcms i18n routing — types.
 *
 * See `docs/i18n-routing-design.md` for the full design.
 *
 * - `RouteSpec` declares one route in a locale-agnostic way; per-locale URL
 *   slugs live in `slugs`.
 * - `SlugTable` is the ordered list of `RouteSpec`s for the whole site.
 * - `LocaleUrlBuilder` is the contract that hides the URL strategy
 *   (prefix / sub-domain / ccTLD). All URL construction goes through it,
 *   so a future migration is one constructor swap.
 */

import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/** ISO-ish locale code (e.g. 'fr', 'en', 'pt-BR'). */
export type Locale = string

/** Vue component reference: either a raw component or a lazy import. */
export type RouteComponent = Component | (() => Promise<Component | { default: Component }>)

/**
 * One logical route, locale-aware.
 *
 * The `slugs` map gives the URL segment per locale. Children's slugs are
 * appended to the parent's at build time. Use `:param` syntax inside slugs
 * for dynamic segments — the same param keys must appear in every locale.
 *
 * @example
 * {
 *   name: 'event-detail',
 *   slugs: { en: 'events/:slug', fr: 'evenements/:slug' },
 *   component: () => import('./pages/EventDetail.vue'),
 * }
 */
export interface RouteSpec {
  /** Stable logical id, locale-agnostic. Used as the canonical key. */
  name: string
  /** Per-locale URL segment (no leading slash). May contain `:param` placeholders. */
  slugs: Record<Locale, string>
  /** Vue component to mount. */
  component: RouteComponent
  /** Arbitrary metadata copied into vue-router's `route.meta`. */
  meta?: Record<string, unknown>
  /** Nested routes — child slug joins parent slug at build time. */
  children?: RouteSpec[]
}

export type SlugTable = RouteSpec[]

/**
 * URL builder — single contract for going from a logical route name to a URL.
 *
 * Implementations:
 * - `createPrefixUrlBuilder()`  → `/${locale}/${slug}`
 * - `createDomainUrlBuilder()`  → `https://${domains[locale]}/${slug}`
 *
 * Always pass through this function for any locale-aware URL (`<RouterLink>`,
 * canonical, hreflang, programmatic navigation). Migration prefix→domain is
 * a one-line swap of the injected instance.
 */
export type LocaleUrlBuilder = (
  locale: Locale,
  routeName: string,
  params?: Record<string, string | number>
) => string

/**
 * Output of {@link buildRoutes} — the actual `RouteRecordRaw[]` consumed by
 * vue-router, plus a back-reference to the source table for downstream tools
 * (LangSwitcher, SEO, URL builder).
 */
export interface BuiltRoutes {
  routes: RouteRecordRaw[]
  table: SlugTable
  locales: Locale[]
  defaultLocale: Locale
}
