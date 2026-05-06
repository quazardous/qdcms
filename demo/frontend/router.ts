import { createRouter, createWebHistory } from 'vue-router'
import {
  PageRenderer,
  buildRoutes,
  createPrefixUrlBuilder,
  type Locale,
  type SlugTable,
  type StackLevelMetaTemplate,
} from 'qdcms'

declare module 'vue-router' {
  interface RouteMeta {
    stack?: StackLevelMetaTemplate[]
    locale?: Locale
    routeName?: string
    i18n?: boolean
    catchAll?: boolean
  }
}

export const LOCALES: Locale[] = ['en', 'fr']
export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Locale-agnostic route table — `name` is the canonical id, `slugs` give the
 * URL segment per locale. The Flower-Craft demo started life in French; the
 * EN slugs were chosen to feel natural in English.
 */
export const slugTable: SlugTable = [
  {
    name: 'home',
    slugs: { en: '', fr: '' },
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'home' }] },
  },
  {
    name: 'realisations',
    slugs: { en: 'works', fr: 'realisations' },
    component: PageRenderer,
    meta: { stack: [{ type: 'collection', name: 'realisations' }] },
    children: [
      {
        name: 'realisation',
        slugs: { en: ':slug', fr: ':slug' },
        component: PageRenderer,
        meta: {
          stack: [
            { type: 'collection', name: 'realisations' },
            { type: 'item', name: 'realisation', idParam: 'slug' },
          ],
        },
      },
    ],
  },
  {
    name: 'prestations',
    slugs: { en: 'services', fr: 'prestations' },
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'prestations' }] },
  },
  {
    name: 'demarche',
    slugs: { en: 'approach', fr: 'demarche' },
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'demarche' }] },
  },
  {
    name: 'contact',
    slugs: { en: 'contact', fr: 'contact' },
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'contact' }] },
  },
  {
    name: 'me',
    slugs: { en: 'me', fr: 'me' },
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'me' }] },
  },
]

const built = buildRoutes(slugTable, {
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  catchAllComponent: PageRenderer,
  // Admin lives at a raw, non-localised `/admin` path. We DON'T pass
  // `reservedPaths: ['/admin']` because the negative-lookahead regex
  // it generates is rejected by vue-router's path parser. Vue Router
  // already prioritises explicit paths over the catch-all by
  // specificity, so `/admin` (added via `router.addRoute()` in
  // `admin/_register.ts`) wins without further help. The root
  // redirect is exact-match on `/`, so it never touches `/admin`.
})

/**
 * URL builder shared between the router, `LangSwitcher`, and any link helper.
 * Default mode is `prefix` (`/${locale}/${slug}`). Switch to
 * `createDomainUrlBuilder` when domain mode comes online — no consumer code
 * changes.
 */
export const buildUrl = createPrefixUrlBuilder({ slugTable })

export const router = createRouter({
  // BASE_URL tracks Vite's `base` config — `/` in dev, `/qdcms/` on GitHub Pages.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: built.routes,
})

/**
 * Append slug entries to the live slug table and the router after they
 * were built — used by additive zones (admin, plugin areas) imported
 * as side-effect modules from `main.ts`.
 *
 * Why it works after the router is already created:
 *   • `createPrefixUrlBuilder` captures the slug table by reference and
 *     re-reads it on every call, so pushing into the same array is
 *     enough to make `buildUrl(locale, name)` resolve the new entries.
 *   • `router.addRoute()` registers extra paths after construction;
 *     vue-router's matcher prioritises by path specificity, so the
 *     locale-prefixed admin paths win over the catch-all without
 *     having to reorder anything.
 */
export function extendRouter(entries: SlugTable): void {
  for (const entry of entries) slugTable.push(entry)
  const extra = buildRoutes(entries, {
    locales: LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    rootRedirect: false,
    appendCatchAll: false,
  })
  for (const route of extra.routes) router.addRoute(route)
}
