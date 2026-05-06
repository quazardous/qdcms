/**
 * Slug table lookup helpers.
 *
 * The slug table is the source of truth for the route name ↔ per-locale slug
 * mapping. These helpers walk it in both directions: name → slug (for URL
 * building) and slug → name (for parsing inbound URLs without going through
 * vue-router's resolution, useful in `detectLocale`).
 */

import type { Locale, RouteSpec, SlugTable } from './types'

/**
 * Find a `RouteSpec` by its logical `name`, walking children recursively.
 * Returns `null` if not found.
 */
export function findRouteByName(table: SlugTable, name: string): RouteSpec | null {
  for (const spec of table) {
    if (spec.name === name) return spec
    if (spec.children) {
      const child = findRouteByName(spec.children, name)
      if (child) return child
    }
  }
  return null
}

/**
 * Build the path to a route name in a given locale, joining parent slugs.
 *
 * Example: with the spec
 *   { name: 'events', slugs: { fr: 'evenements' },
 *     children: [{ name: 'event-detail', slugs: { fr: ':slug' } }] }
 * `buildSlugPath(table, 'event-detail', 'fr')` → `'evenements/:slug'`.
 *
 * Throws when `name` is unknown or the locale is missing for some level.
 */
export function buildSlugPath(table: SlugTable, name: string, locale: Locale): string {
  const path = walkPath(table, name, locale, [])
  if (!path) throw new Error(`[qdcms/i18n] route "${name}" not found in slug table`)
  return path.filter((seg) => seg.length > 0).join('/')
}

function walkPath(
  table: SlugTable,
  name: string,
  locale: Locale,
  ancestors: string[]
): string[] | null {
  for (const spec of table) {
    const slug = spec.slugs[locale]
    if (slug === undefined) {
      throw new Error(
        `[qdcms/i18n] route "${spec.name}" is missing a slug for locale "${locale}"`
      )
    }
    const here = [...ancestors, slug]
    if (spec.name === name) return here
    if (spec.children) {
      const found = walkPath(spec.children, name, locale, here)
      if (found) return found
    }
  }
  return null
}

/**
 * All route names declared in the table, recursively (depth-first).
 */
export function listRouteNames(table: SlugTable): string[] {
  const out: string[] = []
  walkNames(table, out)
  return out
}

function walkNames(table: SlugTable, out: string[]): void {
  for (const spec of table) {
    out.push(spec.name)
    if (spec.children) walkNames(spec.children, out)
  }
}

/**
 * All locales declared in the table, gathered from the union of `slugs` keys
 * across every spec. Returned in the order they were first seen.
 *
 * Useful as a sanity check: every spec must declare every locale.
 */
export function discoverLocales(table: SlugTable): Locale[] {
  const seen = new Set<Locale>()
  const order: Locale[] = []
  walkLocales(table, seen, order)
  return order
}

function walkLocales(table: SlugTable, seen: Set<Locale>, order: Locale[]): void {
  for (const spec of table) {
    for (const loc of Object.keys(spec.slugs)) {
      if (!seen.has(loc)) {
        seen.add(loc)
        order.push(loc)
      }
    }
    if (spec.children) walkLocales(spec.children, seen, order)
  }
}

/**
 * Validate that every `RouteSpec` declares every expected locale. Returns the
 * list of missing `(routeName, locale)` pairs (empty when valid).
 */
export function findMissingSlugs(
  table: SlugTable,
  expectedLocales: Locale[]
): Array<{ name: string; locale: Locale }> {
  const out: Array<{ name: string; locale: Locale }> = []
  walkMissing(table, expectedLocales, out)
  return out
}

function walkMissing(
  table: SlugTable,
  locales: Locale[],
  out: Array<{ name: string; locale: Locale }>
): void {
  for (const spec of table) {
    for (const locale of locales) {
      if (!(locale in spec.slugs)) out.push({ name: spec.name, locale })
    }
    if (spec.children) walkMissing(spec.children, locales, out)
  }
}
