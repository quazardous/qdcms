# qdcms — i18n integration plan

> **Status** : planned, not started.
> **Blocker** : qdadm i18n branch not yet published. We freeze the contract once
> qdadm exposes its public i18n API, so the bridge in §6 can be designed
> against a real surface rather than a guessed one.

## 1. Goals

- Allow qdcms-built sites to be served in multiple languages.
- Locale is a first-class context dimension, **not** a placement criterion.
  Blocks adapt their rendering via translations; placement rules stay locale-agnostic.
- Routing carries the locale as a path prefix (`/fr/...`, `/en/...`) for
  SEO-clean URLs and explicit user intent.
- Pair cleanly with qdadm's i18n so a unified app (mono-app or two-apps) shares
  the same active locale without manual sync.

## 2. Strategic choices (frozen)

| Topic | Decision | Rationale |
|---|---|---|
| Translation lib | **vue-i18n** (v9+, composition API) | De facto Vue standard; aligns with qdadm which uses `useI18n()` |
| URL strategy | **Path prefix mandatory** (`/fr/...`, `/en/...`) | SEO-clean, explicit, demonstrates the StackBuilder seam |
| Slug translation | **Shared slugs** (e.g. `realisations` keeps the FR slug everywhere) | Keeps demo simple; full slug-translation can be a follow-up pattern |
| Languages | **FR (default) + EN** | Minimum viable to prove the mechanism |
| Default redirect | `/` → `/<browser-locale>/` (fallback FR) | One-liner in router |
| Untranslated fallback | Fall back to FR for missing keys / locale-aware data | Standard vue-i18n behavior |

## 3. Framework changes (qdcms package)

### 3.1 `localeAwareStackBuilder`

A factory that wraps another `StackBuilder` (default: `declaredStackBuilder`),
detects the locale segment from the route path, and (a) calls
`cms.setLocale(locale)` as a side-effect, (b) lets the inner builder run on the
route as-is — vue-router has already resolved `:locale` as a param.

```ts
// packages/qdcms/src/stack/LocaleAwareStackBuilder.ts
export interface LocaleAwareStackBuilderOptions {
  /** Param name carrying the locale (default: "locale") */
  paramName?: string
  /** Allowed locales (validates and rejects unknown values) */
  locales: string[]
  /** Fallback when the route has no locale param */
  defaultLocale: string
  /** Wrapped builder — runs after locale is set */
  inner?: StackBuilder
}

export function localeAwareStackBuilder(
  opts: LocaleAwareStackBuilderOptions
): StackBuilder {
  const inner = opts.inner ?? declaredStackBuilder
  const param = opts.paramName ?? 'locale'
  const allowed = new Set(opts.locales)
  return (input) => {
    const raw = input.route.params[param] as string | undefined
    const locale = raw && allowed.has(raw) ? raw : opts.defaultLocale
    if (input.cms.context.locale !== locale) {
      input.cms.setLocale(locale)
    }
    return inner(input)
  }
}
```

**Why a factory** (vs a single function) : locales + default + inner builder
are user-config; passing them through closure beats global state.

### 3.2 Tests (Vitest)

`packages/qdcms/src/stack/__tests__/LocaleAwareStackBuilder.test.ts`

- ✅ When route has `params.locale = 'fr'` → calls `cms.setLocale('fr')`
- ✅ When route has `params.locale = 'en'` → calls `cms.setLocale('en')`
- ✅ When `params.locale` is unknown (`'de'`) → falls back to `defaultLocale`, calls `setLocale(default)`
- ✅ When `params.locale` is missing → falls back to `defaultLocale`
- ✅ When current locale already matches → does **not** call `setLocale` again (idempotent)
- ✅ Passes through to inner builder unchanged
- ✅ Custom `paramName` works (`'lang'` instead of `'locale'`)

### 3.3 Public API

Export from `packages/qdcms/src/index.ts`:
```ts
export {
  declaredStackBuilder,
  localeAwareStackBuilder,
  type LocaleAwareStackBuilderOptions,
  type StackBuilder,
  type StackBuilderInput,
  type StackLevelMetaTemplate,
} from './stack/StackBuilder'
```

## 4. Demo changes (`packages/demo`)

### 4.1 Install + setup

```bash
npm install --workspace=demo vue-i18n@^9
```

```ts
// src/i18n.ts
import { createI18n } from 'vue-i18n'
import fr from './locales/fr.json'
import en from './locales/en.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: { fr, en },
})
```

### 4.2 Router refactor

```ts
// src/router.ts — every route nested under :locale(fr|en)
const localeGuard = ':locale(fr|en)'

routes: [
  { path: '/', redirect: () => `/${detectBrowserLocale()}/` },
  {
    path: `/${localeGuard}`,
    component: PageRenderer,
    meta: { stack: [{ type: 'page', name: 'home' }] },
  },
  {
    path: `/${localeGuard}/realisations`,
    component: PageRenderer,
    meta: { stack: [{ type: 'collection', name: 'realisations' }] },
  },
  // ... etc
  { path: '/:pathMatch(.*)*', redirect: '/fr/' },
]
```

### 4.3 Wire localeAwareStackBuilder

```ts
// App.vue (or main.ts)
const stackBuilder = localeAwareStackBuilder({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
})
bindRouter(router, cms, { stackBuilder })
```

Plus, sync vue-i18n with cms locale:

```ts
// in App.vue setup
watch(
  () => cms.context.locale,
  (loc) => { if (loc) i18n.global.locale.value = loc },
  { immediate: true }
)
```

### 4.4 LangSwitcher block

A header block that reads the current route, swaps the `:locale` param,
and pushes the new path. `when: {}` (always present).

```vue
<!-- blocks/LangSwitcher.vue -->
<button @click="switchTo('fr')">FR</button>
<button @click="switchTo('en')">EN</button>
```

Placement:
```ts
cms.place('lang-switcher', { region: 'header', weight: 40 })
```

### 4.5 Refactor blocks

Replace hardcoded FR strings with `t('block.key')` in:

- `SiteNav` (links: Réalisations / Prestations / Démarche / Contact)
- `SiteFooter` (col headings, brand tagline, address)
- `Hero` (defaults if not passed via props)
- `Intro`, `ServicesList`, `Demarche`, `ContactBlock`
- `LoginCta`, `UserPill`, `ProWelcome`, `MyProjects`
- `Breadcrumb` (label dictionary)
- `RealizationDetail` (UI strings; body comes from data — see §4.6)

`cms.ts` placements that pass static `props` (titles, taglines) → either keep
the keys in messages and pass `t('home.hero.title')` at registration time, or
move the props lookup inside the block via `t()`.

**Reco** : keep static `props` for non-i18n config (limit, layout-specific),
move all visible strings inside blocks. Cleaner.

### 4.6 Realizations data — locale-aware bodies

```ts
// data/realizations.ts
export interface Realization {
  // ... existing fields
  body: { fr: string; en: string }
}

// helper
export function localizedBody(r: Realization, locale: string): string {
  return r.body[locale as 'fr' | 'en'] ?? r.body.fr
}
```

Translate **2-3** realizations to EN (not all six) to demonstrate the fallback
behavior — untranslated ones show their FR body in EN mode, which is realistic.

## 5. Locale flow at runtime

```
URL `/en/realisations/foo`
  → vue-router resolves: params = { locale: 'en', slug: 'foo' }
  → localeAwareStackBuilder reads params.locale → cms.setLocale('en')
  → inner declaredStackBuilder builds the stack from route.meta
  → cms.setStack([...])
  → composer recomposes
  → blocks read locale via useI18n() → render translated strings
  → Realization data uses localizedBody(r, 'en')
```

**No global state**. Single source of truth = `cms.context.locale`. vue-i18n is
mirrored from it, not the other way around.

## 6. Bridge with qdadm i18n (deferred — design only)

### 6.1 Known facts about qdadm i18n

- qdadm exposes `useI18n()` (vue-i18n composable name — likely the lib itself)
- qdadm has a SignalBus emitting `signals.emit('locale:change')`
- Concrete API not yet published; **assume nothing**

### 6.2 Open questions to resolve when qdadm i18n branch lands

1. Does qdadm export its own vue-i18n instance, or does it expect the host
   app to provide one ?
2. Does the SignalBus expose a public `subscribe('locale:change', cb)` API,
   or is it internal ?
3. Should mono-app deployments share **one** vue-i18n instance (likely yes,
   for memory/translation key consistency) or run two synced instances ?
4. Where does the locale **decision** live ? In qdadm (back-office sets it)
   or in qdcms (URL drives it) ? In a mono-app, URL probably wins.

### 6.3 Bridge contract (target shape)

A small adapter, lives **outside both** packages — likely a `qdcms-qdadm-bridge`
package or just inline glue in the host app. Exposes:

```ts
bridgeQdadmI18n({
  qdadmSignals,    // the SignalBus instance
  cms,             // the qdcms instance
  // direction = 'qdadm-leads' | 'qdcms-leads' | 'two-way'
})
```

- `qdadm-leads` : qdadm's `locale:change` → `cms.setLocale(loc)`
- `qdcms-leads` : `watch(() => cms.context.locale, qdadmSignals.emit('locale:change', _))`
- `two-way` : both, with loop guard

For our demo (URL-driven), `qdcms-leads` is the likely default.

### 6.4 Non-goals for the bridge

- ❌ Do not unify the translation **dictionaries** — qdadm and qdcms have
  different message sets. They share a vue-i18n instance, not a message file.
- ❌ Do not auto-translate qdcms keys with qdadm keys.

## 7. Order of operations when ready

1. **qdadm i18n branch is published** (waiting on parallel agent)
2. Read qdadm's published i18n API → resolve §6.2 questions
3. **Phase 1 — framework** : add `localeAwareStackBuilder` + tests + export. ~30 min.
4. **Phase 2 — demo** : install vue-i18n, refactor routes, blocks, data. ~1.5 h.
5. **Phase 3 — bridge** : write `bridgeQdadmI18n` adapter, integrate in demo (or a separate mono-app demo). ~1 h.
6. Validate end-to-end: navigate `/fr/...` ↔ `/en/...`, watch breadcrumb / blocks / realizations switch, check qdadm `/admin` follows the locale.

## 8. Estimated total effort

~3 hours of focused work after qdadm i18n lands.
