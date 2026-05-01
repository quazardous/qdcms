/**
 * Generate vue-router `RouteRecordRaw[]` from a `SlugTable`.
 *
 * For each (locale, RouteSpec) pair, emits a route at `/${locale}/${slug}`
 * with the `route.meta` enriched by `{ locale, routeName }`. Children are
 * flattened and prefixed with the parent's slug.
 *
 * Also adds a catch-all `/` redirect to `/${defaultLocale}` and a 404 fallback
 * (the catch-all redirect is opt-in via {@link BuildRoutesOptions}).
 */

import type { RouteRecordRaw } from 'vue-router'
import { findMissingSlugs } from './slugTable'
import type { BuiltRoutes, Locale, RouteSpec, SlugTable } from './types'

export interface BuildRoutesOptions {
  /**
   * The locales to materialise. Every `RouteSpec` must declare a slug for each
   * locale here, otherwise build throws.
   */
  locales: Locale[]
  /** Used for the `/` → `/${defaultLocale}` redirect. */
  defaultLocale: Locale
  /**
   * Extra meta merged into every generated route's `meta`. Useful for marking
   * all i18n routes with a flag (e.g. `i18n: true`) for downstream tooling.
   */
  baseMeta?: Record<string, unknown>
  /**
   * If `true` (default), prepend a `/` route that redirects to the default
   * locale. Set `false` if the host app handles root navigation manually.
   */
  rootRedirect?: boolean
  /**
   * If `true` (default), append a 404 catch-all route at the end. The catch-all
   * is locale-agnostic — it matches anything not consumed by earlier routes.
   * Set `false` if the host app provides its own 404 handler.
   */
  appendCatchAll?: boolean
  /**
   * Component to mount for the catch-all 404. Required when
   * `appendCatchAll` is true.
   */
  catchAllComponent?: RouteSpec['component']
  /**
   * Path prefixes that the qdcms catch-all must NOT swallow.
   *
   * Critical for mono-app cohabitation (e.g. qdadm mounted at `/admin/`
   * inside the same app as qdcms). Without this, a URL like
   * `/admin/anything` would match the qdcms catch-all and never reach the
   * admin's routes.
   *
   * Each prefix is matched against the URL pathname's leading segment(s).
   * Use a leading slash (`'/admin'`) — trailing is optional.
   *
   * Also excluded from the `/` → default-locale redirect (so `/admin` does
   * not get rewritten to `/en/admin`).
   */
  reservedPaths?: string[]
}

export function buildRoutes(table: SlugTable, options: BuildRoutesOptions): BuiltRoutes {
  const {
    locales,
    defaultLocale,
    baseMeta = {},
    rootRedirect = true,
    appendCatchAll = true,
    reservedPaths = [],
  } = options

  if (!locales.includes(defaultLocale)) {
    throw new Error(
      `[qdcms/i18n] defaultLocale "${defaultLocale}" must be in locales [${locales.join(', ')}]`
    )
  }

  const missing = findMissingSlugs(table, locales)
  if (missing.length > 0) {
    const summary = missing.map((m) => `"${m.name}" missing locale "${m.locale}"`).join(', ')
    throw new Error(`[qdcms/i18n] slug table is incomplete: ${summary}`)
  }

  const reserved = reservedPaths.map(normalizeReservedPrefix)

  const routes: RouteRecordRaw[] = []

  if (rootRedirect) {
    routes.push({
      path: '/',
      redirect: `/${defaultLocale}`,
      // The redirect only fires on exact `/`, so reserved paths like `/admin`
      // are not affected. Recorded here for completeness.
    })
  }

  for (const locale of locales) {
    for (const spec of table) {
      routes.push(...flatten(spec, locale, `/${locale}`, baseMeta))
    }
  }

  if (appendCatchAll) {
    if (!options.catchAllComponent) {
      throw new Error('[qdcms/i18n] appendCatchAll: true requires `catchAllComponent`')
    }
    routes.push({
      path: buildCatchAllPath(reserved),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component: options.catchAllComponent as any,
      meta: { ...baseMeta, i18n: true, catchAll: true },
    } as RouteRecordRaw)
  }

  return { routes, table, locales, defaultLocale }
}

function normalizeReservedPrefix(prefix: string): string {
  // Strip leading + trailing slashes, escape regex specials.
  const trimmed = prefix.replace(/^\/+|\/+$/g, '')
  if (!trimmed) {
    throw new Error(`[qdcms/i18n] reservedPaths entry "${prefix}" must include a path segment`)
  }
  return trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build the catch-all path. Without reserved paths it's the canonical
 * `/:pathMatch(.*)*`. With them, the regex uses a negative lookahead so the
 * catch-all does not swallow `/admin/...` etc.
 *
 * Note: vue-router 4 supports regex-constrained params; the resulting path
 * is `/:pathMatch((?!admin/|admin$|other/).*)*`.
 */
function buildCatchAllPath(reserved: string[]): string {
  if (reserved.length === 0) return '/:pathMatch(.*)*'
  const lookahead = reserved.map((p) => `${p}(?:/|$)`).join('|')
  return `/:pathMatch((?!${lookahead}).*)*`
}

function flatten(
  spec: RouteSpec,
  locale: Locale,
  parentPath: string,
  baseMeta: Record<string, unknown>
): RouteRecordRaw[] {
  const slug = spec.slugs[locale]!  // guarded by findMissingSlugs above
  const path = joinPath(parentPath, slug)
  const route = {
    path,
    name: `${locale}.${spec.name}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: spec.component as any,
    meta: {
      ...baseMeta,
      ...(spec.meta ?? {}),
      i18n: true,
      locale,
      routeName: spec.name,
    },
  } as RouteRecordRaw

  const out: RouteRecordRaw[] = [route]
  if (spec.children) {
    for (const child of spec.children) {
      out.push(...flatten(child, locale, path, baseMeta))
    }
  }
  return out
}

function joinPath(parent: string, slug: string): string {
  if (slug === '') return parent
  if (parent.endsWith('/')) return parent + slug
  return `${parent}/${slug}`
}
