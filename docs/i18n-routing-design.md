# qdcms i18n Routing — Design

**Status:** design only, not implemented yet.
**Companion doc:** [`i18n-plan.md`](./i18n-plan.md) (high-level intent).
**Decisions captured here:**

| # | Decision | Choice |
|---|---|---|
| 1 | Translation engine | **vue-i18n 9** in qdcms; share primitives via `@quazardous/qdcore/i18n` |
| 2 | URL strategy (primary) | **Path prefix** (`/fr/...`, `/en/...`) — pluggable for future domain |
| 3 | Slug translation | **Real per-locale slugs** (`/fr/evenements` vs `/en/events`), not just prefix |
| 4 | Default locale | **EN** (matches qdadm `core.en.ts`) |
| 5 | `PlacementConditions.locale` | **Kept** (already in `types.ts:127`) — escape hatch for cases where `t()` isn't enough |
| 6 | qdadm ↔ qdcms locale sync | **Single SignalBus** (`I18N_SIGNALS.LOCALE_CHANGE` / `LOCALE_CHANGED`), no shared engine |

---

## URL strategy: prefix vs domain (analysis closed)

| Aspect | Prefix `/fr/...` | Sub-domain `fr.x.com` | ccTLD `x.fr` / `x.com` |
|---|---|---|---|
| SEO geo signal | weak | medium | strong |
| DNS / SSL | 1 / 1 | N / 1 wildcard or N | N / N |
| Deployment | 1 build | N targets or 1 + routing | N |
| Cookies / auth | shared (single origin) | scopable (parent domain) | independent → SSO required |
| Local dev | trivial | hosts file or proxy | proxy |
| CORS | none | possible if cross-locale APIs | always |
| Switch UX | path change instant | reload SSL + cookies refresh | new site |
| Brand differentiation per locale | hard | possible | trivial |

**Pick:** prefix as the default; design the layer pluggable so domain migration later is one constructor swap. Domain mode becomes attractive when (a) SEO geo-targeting matters more than ops simplicity, (b) per-country branding diverges, or (c) per-region hosting (data residency, edge CDN) is a real requirement.

---

## File layout

```
qdcms/packages/qdcms/src/i18n/
├─ types.ts                      — RouteSpec, SlugTable, LocaleUrlBuilder, …
├─ slugTable.ts                  — registry + lookups (slug↔name, name+locale→slug)
├─ buildRoutes.ts                — table → vue-router routes (with :locale prefix)
├─ urlBuilder.ts                 — prefix + domain implementations of LocaleUrlBuilder
├─ detectLocale.ts               — URL > cookie > Accept-Language > default
├─ localeAwareStackBuilder.ts    — wraps a StackBuilder to push locale into CmsContext
├─ vueI18nProvider.ts            — adapter: TranslationProvider → vue-i18n bundle
├─ bridge.ts                     — SignalBus bridge with qdadm i18n
├─ seo.ts                        — <html lang>, hreflang, canonical
└─ index.ts

qdcms/packages/qdcms/src/components/i18n/
└─ LangSwitcher.vue              — UI selector
```

Roughly **~500 LOC** new, ~3 days for an MVP demo, +1–2 days polish (404 on invalid slug, redirect `/` to default locale, params edge cases, tests).

---

## Core type: `RouteSpec`

```ts
// types.ts
export type Locale = string  // 'fr', 'en', …

export interface RouteSpec {
  /** Stable logical id (e.g. 'events', 'event-detail', 'about'). */
  name: string
  /** Per-locale URL segment. */
  slugs: Record<Locale, string>
  /** Vue component to mount (lazy). */
  component: () => Promise<unknown>
  /** Dynamic params suffix, e.g. ':id'. */
  params?: string
  /** Arbitrary metadata copied into `route.meta`. */
  meta?: Record<string, unknown>
  /** Nested routes — child slug joins the parent slug. */
  children?: RouteSpec[]
}

export type SlugTable = RouteSpec[]
```

### Example

```ts
const table: SlugTable = [
  { name: 'home', slugs: { en: '', fr: '' }, component: () => import('./pages/Home.vue') },
  {
    name: 'events',
    slugs: { en: 'events', fr: 'evenements' },
    component: () => import('./pages/EventsList.vue'),
    children: [
      {
        name: 'event-detail',
        slugs: { en: ':id', fr: ':id' },  // params often identical across locales
        component: () => import('./pages/EventDetail.vue'),
      },
    ],
  },
  { name: 'about', slugs: { en: 'about', fr: 'a-propos' }, component: () => import('./pages/About.vue') },
]
```

---

## `buildRoutes(table, locales) → RouteRecordRaw[]`

```ts
function buildRoutes(table: SlugTable, locales: Locale[]): RouteRecordRaw[] {
  const flat: RouteRecordRaw[] = []
  for (const locale of locales) {
    for (const spec of table) {
      flat.push(...flatten(spec, locale, `/${locale}`))
    }
  }
  return flat
}

function flatten(spec: RouteSpec, locale: Locale, parentPath: string): RouteRecordRaw[] {
  const slug = spec.slugs[locale]
  const path = joinPath(parentPath, slug)
  const route: RouteRecordRaw = {
    path,
    name: `${locale}.${spec.name}`,
    component: spec.component,
    meta: { ...spec.meta, locale, routeName: spec.name },
  }
  return [route, ...(spec.children ?? []).flatMap(c => flatten(c, locale, path))]
}
```

For the example table this generates:
- `/en/`, `/fr/`
- `/en/events`, `/fr/evenements`
- `/en/events/:id`, `/fr/evenements/:id`
- `/en/about`, `/fr/a-propos`

A separate catch-all (`/` → `/${defaultLocale}`) is added by the bootstrap.

---

## `detectLocale(options) → Locale`

Priority chain: **URL → cookie → `navigator.languages` → defaultLocale**.

```ts
export function detectLocale(opts: {
  available: Locale[]
  defaultLocale: Locale
  cookieName?: string
  url?: string  // injectable for SSR / tests
}): Locale {
  // 1. URL prefix
  const fromUrl = matchLocaleFromUrl(opts.url ?? location.pathname, opts.available)
  if (fromUrl) return fromUrl

  // 2. cookie ('qdcms_locale' by default)
  const fromCookie = readCookie(opts.cookieName ?? 'qdcms_locale')
  if (fromCookie && opts.available.includes(fromCookie)) return fromCookie

  // 3. Accept-Language (navigator.languages in SPA)
  for (const lang of navigator.languages ?? []) {
    const short = lang.slice(0, 2)
    if (opts.available.includes(short)) return short
  }

  return opts.defaultLocale
}
```

A bare URL `/foo` (no locale prefix) hits a `beforeEach` guard that redirects to `/${detect()}/foo`.

---

## `LocaleUrlBuilder` — the prefix vs domain abstraction

```ts
export type LocaleUrlBuilder = (
  locale: Locale,
  routeName: string,
  params?: Record<string, string | number>
) => string

// Default (prefix)
export function createPrefixUrlBuilder(deps: {
  slugTable: SlugTable
  locales: Locale[]
}): LocaleUrlBuilder {
  return (locale, name, params = {}) => {
    const slug = lookupSlug(deps.slugTable, name, locale)
    return interpolate(`/${locale}/${slug}`, params)
  }
}

// Future (domain) — same contract, different implementation
export function createDomainUrlBuilder(deps: {
  slugTable: SlugTable
  domains: Record<Locale, string>  // { fr: 'site.fr', en: 'site.com' }
}): LocaleUrlBuilder {
  return (locale, name, params = {}) => {
    const slug = lookupSlug(deps.slugTable, name, locale)
    return interpolate(`https://${deps.domains[locale]}/${slug}`, params)
  }
}
```

Migration prefix→domain later = swap the injected instance. Consumer code (`LangSwitcher`, link helpers, SEO) does not change.

---

## `localeAwareStackBuilder` — push locale into `CmsContext`

```ts
export function withLocale(inner: StackBuilder): StackBuilder {
  return (input) => {
    const locale = input.route.meta?.locale as Locale | undefined
    if (locale) input.cms.setLocale(locale)  // existing CmsContext API
    return inner(input)
  }
}

// usage at bootstrap
cms.useStackBuilder(withLocale(declaredStackBuilder))
```

---

## `LangSwitcher.vue`

```vue
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useLocaleUrl, AVAILABLE_LOCALES } from '../i18n'

const route = useRoute()
const router = useRouter()
const buildUrl = useLocaleUrl()

function switchTo(locale: string) {
  const currentName = route.meta.routeName as string
  const target = buildUrl(locale, currentName, route.params)
  document.cookie = `qdcms_locale=${locale}; path=/; max-age=31536000`
  router.push(target)
}
</script>

<template>
  <div class="lang-switcher">
    <button
      v-for="loc in AVAILABLE_LOCALES"
      :key="loc"
      :class="{ active: route.meta.locale === loc }"
      @click="switchTo(loc)"
    >
      {{ loc.toUpperCase() }}
    </button>
  </div>
</template>
```

---

## `vueI18nProvider` — bridge to qdcore primitives

```ts
import type { TranslationProvider } from '@quazardous/qdcore'
import { createI18n, type I18n as VueI18nInstance } from 'vue-i18n'

export async function createVueI18nFromProviders(opts: {
  providers: TranslationProvider[]
  locales: Locale[]
  defaultLocale: Locale
  fallbackLocale: Locale
}): Promise<VueI18nInstance> {
  const messages: Record<string, Record<string, unknown>> = {}
  for (const locale of opts.locales) {
    messages[locale] = {}
    for (const p of opts.providers) {
      const bundle = await p.load(locale)
      Object.assign(messages[locale], bundle)
    }
  }
  return createI18n({
    legacy: false,
    locale: opts.defaultLocale,
    fallbackLocale: opts.fallbackLocale,
    messages,
  })
}
```

This means qdcms can:
- consume the **same** `TranslationProvider` implementations qdadm uses (e.g., `InlineTranslationProvider` from qdcore)
- still benefit from vue-i18n's pluralization, datetime/number formatting, devtools

---

## `bridge.ts` — cross-talk with qdadm

For combined apps that mount both qdadm and qdcms (rare, but designed-for):

```ts
import { I18N_SIGNALS, type SignalBus } from '@quazardous/qdcore'
import { watch } from 'vue'

export function bridgeVueI18nToSignalBus(vueI18n: VueI18nInstance, signals: SignalBus) {
  // Inbound: qdadm or any other i18n requested a locale change
  signals.on(I18N_SIGNALS.LOCALE_CHANGE, ({ data }) => {
    if (typeof data === 'string') vueI18n.global.locale.value = data
  })

  // Outbound: vue-i18n switched, broadcast to anyone listening
  watch(() => vueI18n.global.locale.value, (loc) => {
    signals.emit(I18N_SIGNALS.LOCALE_CHANGED, loc)
  })
}
```

This is the *one-line bridge* mentioned in `i18n-plan.md` §6. It's possible because `I18N_SIGNALS` was extracted to `qdcore` (qdadm 1.16.0).

---

## `seo.ts` — SPA hreflang / canonical

```ts
export function applyLocaleSeo(opts: {
  locale: Locale
  available: Locale[]
  buildUrl: LocaleUrlBuilder
  routeName: string
  params?: Record<string, string>
}) {
  document.documentElement.lang = opts.locale

  // Remove old hreflang tags
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(n => n.remove())

  // Inject one per locale
  for (const loc of opts.available) {
    const link = document.createElement('link')
    link.rel = 'alternate'
    link.hreflang = loc
    link.href = location.origin + opts.buildUrl(loc, opts.routeName, opts.params)
    document.head.appendChild(link)
  }
}
```

Wired in `router.afterEach` to refresh on every route change.

**SPA caveat:** these tags are set client-side. For full SEO (Googlebot rendering), this works — but for crawler-friendly pre-rendering, look at static-rendering tools (e.g. `vite-plugin-prerender`) or migrate the rendering layer later.

---

## Content-level fallback

For data with localized fields like `body: { en: '...', fr: '...' }`:

```ts
export function localized<T>(field: Record<Locale, T>, locale: Locale, fallback: Locale): T {
  return field[locale] ?? field[fallback]
}
```

Combined optionally with `PlacementConditions.locale` (`types.ts:127`) when you really want a *different* block per locale (legal notices, region-specific CTAs).

---

## Implementation order

1. `types.ts` + `slugTable.ts` + `buildRoutes.ts` → migrate the demo's router; verify `/en/foo` and `/fr/foo` resolve.
2. `detectLocale.ts` + redirect `/` → default locale.
3. `urlBuilder.ts` + `LangSwitcher.vue` → working language switch.
4. `localeAwareStackBuilder.ts` → push locale into `CmsContext`.
5. `vueI18nProvider.ts` → label translation works in components.
6. `seo.ts` → hreflang + `<html lang>`.
7. `bridge.ts` → only if you mount alongside qdadm.

---

## Open follow-ups

- **Default locale fallback for unknown slugs:** if `/fr/invalid` doesn't match, do we 404 or redirect to `/en/invalid`? Decision deferred.
- **Locale-specific stack templates:** `route.meta.stack` may need translation (e.g., breadcrumb labels). Currently labels go through `t()` → fine, but the stack-level `name` field is a logical id, not displayed. No change needed.
- **Static prerendering:** SPA limitation — search engines rendering JS works but SSG/SSR will eventually be tempting for SEO. Out of scope here.
- **Pluralization rules + datetime formats:** vue-i18n covers it; project-level number/date format objects to define when first needed.
- **RTL support:** if Arabic/Hebrew enter scope, add `dir="rtl"` to `applyLocaleSeo` and CSS logical properties throughout.
