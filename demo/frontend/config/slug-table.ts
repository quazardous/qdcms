/**
 * config/slug-table.ts — locale-agnostic route table.
 *
 * One entry per page-type or collection ; `slugs` carries the
 * URL segment per active locale (see `locales.ts`). The router
 * is built from this table by `qdcms.buildRoutes` (called from
 * the shell-y `router.ts`).
 *
 * Per §6.6, this becomes a `page-types.yaml` once the page-type
 * plugin (Axis 1) materialises. Today it's hand-written TS.
 */

import { PageRenderer, type SlugTable } from 'qdcms'

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
