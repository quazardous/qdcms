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
