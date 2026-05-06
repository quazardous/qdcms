# Changelog

Shipped slices, in feature-oriented summaries.

**Convention** : when an axis or slice lands, its essence is captured
here (what changed for users + consumers) and the corresponding
section is dropped from `docs/roadmap.md` so that doc stays
forward-looking. Detailed design lives in `docs/` ; this file only
notes what shipped.

- Versions track packages independently (`qdcms-core`, `qdcms-cli`, …).
- Each entry : one-paragraph framing + bullet list of feats / breaking
  changes. No commit-log noise.

---

## [qdcms-core 0.3.0] — 2026-05-06 — Module / Plugin / Kernel foundation

A real extension contract for qdcms. Modules and plugins become
first-class kernel-managed entities with topological ordering,
chain-of-replacers semantics and a uniform lifecycle. This is the
plumbing every following axis sits on.

### Added

- **Module class** (`@quazardous/qdcms-core/module`) — base class
  with compile-time, backend, and frontend lifecycle hooks.
  Citizenship `'module'` = ships inside qdcms-core.
- **Plugin contract** (`@quazardous/qdcms-core/plugin`) — strict
  public interface validated at the boundary via Valibot.
  Citizenship `'plugin'` = discipline (public-API only, validated),
  not distribution. A plugin can ship via npm, workspace-internal,
  instance-local file, or explicit list — same contract.
- **Kernel** (`@quazardous/qdcms-core/kernel`) — slot registry +
  topology resolver :
  - chain-of-replacers (multiple plugins layer on the same role,
    ordered by `weight` ; same-slot + same-weight = fatal),
  - `replaced(slot, caller)` helper for wrapping plugins to delegate
    to predecessors,
  - lifecycle dispatch : `installAll` / `uninstallAll` (every chain
    entry, bottom-to-top resp. mirror), `connectAll` /
    `disconnectAll` / `registerAllHttpRoutes` / `loadStylesAll`
    (active only), `collectConfigSchemas` (whole topology).
- **ConfigModule** (`@quazardous/qdcms-core/config`) — central hub
  for high-level config. `ConfigModule.compile({ kernel, instanceDir,
  … })` is the canonical compile entry point ; aggregates schemas
  across the whole topology so every active Module / Plugin's
  namespaces participate in validation. Forward direction baked
  into the JSDoc : runtime sharing, override layer (slice C9),
  qdadm-side schema-driven editor UI, orthogonal `protected` /
  `hidden` visibility flags for the gray zone.
- **DCModule skeleton** (`@quazardous/qdcms-core/dc`) — first non-
  config module on the kernel. Citizenship `'module'` (DC is
  framework-essential ; the slot stays plugin-overridable via
  `replaces: ['dc']` if a swappable backend is ever needed).
  Static contract only ; entities + install seeding + HTTP routes
  follow.
- **`registerSources(kernel, { modules, plugins })`** — convenience
  helper for the common boot pattern. Loaders are plural — each
  discovery mode (npm walker, file scanner, instance-config) is
  its own loader feeding this entry point.

### Changed (breaking)

- **Legacy Plugin contract removed.** The manifest-based
  `Plugin` / `PluginRegistry` / `PluginManifest` and
  `PluginContext` / `PluginLifecycleHooks` are gone. The data
  shape survives transitionally as `ComponentManifest` /
  `ComponentRegistry` for the migration runtime — they retire when
  the runner is rewired to walk `Module[]` via the Kernel.
- **Subpath rename** : `@quazardous/qdcms-core/plugin` is now the
  **new** Plugin interface. The transitional layer lives at
  `@quazardous/qdcms-core/registry`.
- Variable rename in the migration runtime : `pluginId` /
  `manifestId` → `componentId`.
- **`compileConfig` no longer auto-includes `builtinSchemas`.**
  Callers pass schemas through `ConfigModule.compile(...)` (kernel
  aware) or the explicit `schemas` option. Plain
  `compileConfig({ instanceDir })` no longer validates `qdcms.*`
  concepts — the framework's schemas reach the compiler exclusively
  via the kernel topology.

### CLI

- `qdcms config:compile`, `qdcms config:doctor`, `qdcms install` now
  build a Kernel, register `[ConfigModule, DCModule]`, and call
  `ConfigModule.compile(...)`. Schema validation is whole-topology
  aware automatically.
- `install` honours the umbrella `.compiled/<basename>/` convention
  (was leaking compiled output into `<instance>/.compiled/`).
  `.gitignore` adds `demo/**/.compiled` as belt-and-suspenders.

### Tests

- qdcms-core suite : 232 → 342 (+110). Module + Plugin + Kernel +
  ConfigModule + DCModule + registerSources fully covered.
  qdcms-cli unchanged at 7 ; qdcms-backend / qdcms-plugin-core
  unchanged at 21 / 6.

### Docs

- `docs/modules.md` — full Module + Plugin + Kernel design :
  citizenships, chain semantics, weight, `replaced` helper,
  lifecycle dispatch, drop-and-extend on replace.
- `docs/roadmap.md` — Axis 2 retitled "DC Module" ; the "first
  published Plugin" framing reassigned to a future auth-replacer
  example.

---

## [qdcms-core 0.2.0] — 2026-05-04 — npm-pure plugin distribution

Plugin versioning + dependency resolution become npm's job ;
qdcms-core stops shipping its own range-validation layer.

### Changed (breaking)

- Plugin manifest is **split** between `package.json` (id, version,
  dependencies — npm-managed) and `qdcms-plugin.yaml` (prefix,
  entities, extensions, schemaManaged — qdcms-managed). New
  adapter `buildManifestFromPackageJson` (subpath
  `@quazardous/qdcms-core/loader`) merges them.
- `qdcms-plugin.yaml` MUST NOT carry `id`, `version`, or
  `dependencies` — they live in `package.json`. Adapter throws
  with a clear message otherwise.
- `isValidSemverRange` exported helper removed.
  `InMemoryPluginRegistry.resolveOrder()` no longer enforces
  `semver.satisfies` — npm did that at install time.
- `isValidPluginId` regex relaxed to npm-aligned
  (`@scope/name`, digit-first names, dots, …).

### Added

- `@quazardous/qdcms-core/loader` subpath :
  `buildManifestFromPackageJson` adapter +
  `defaultIsPluginDependency` predicate (matches plugins by name
  containing `qdcms-plugin`).

### Migration note

Consumers of `isValidSemverRange` from
`@quazardous/qdcms-core/plugin` switch to `semver.validRange()`
directly, or — preferred — declare deps in `package.json` and let
npm resolve them.

---

## [qdcms-core 0.1.0 / qdcms 0.2.0] — 2026-05-04 — Initial framework split

Plugin / migration / entity primitives are extracted into their own
package. qdcms grows native i18n routing.

### Added — `@quazardous/qdcms-core` 0.1.0

Subpath exports :

- `./entity` — EntityDescriptor + Repository / BackendStorage /
  FrontendStorage contracts.
- `./plugin` — `PluginManifest` + `Plugin` + `PluginRegistry`
  contract + `InMemoryPluginRegistry` reference impl, semver-aware
  validation. (Replaced by the new contract in qdcms-core 0.3.0.)
- `./migration` — Migration / MigrationRunner / MigrationStore
  contracts, `hashSchema` (SHA-256 over canonical JSON),
  `composeSchema` (multi-plugin merge), `OwnershipTracker` (cross-
  plugin column extension tracking). Node-only.
- `./sql` — MikroORM-backed concrete impls : `MikroOrmBackendStorage`,
  `SqlMigrationStore` (system table `qdcms_schema_state`),
  `MikroOrmMigrationRunner` (compose-then-converge install /
  uninstall on SQLite). Node-only.

Originally bootstrapped in `@quazardous/qdcore` (qdadm repo, Phase
1a/1b) and moved here because the framework is qdcms-centric in
practice. Built on MikroORM 6.x. Depends on `@quazardous/qdcore`
for SignalBus / Stack types.

### Added — qdcms 0.2.0

- **i18n routing primitives** baked into `createCms` :
  `<LocaleLink name="..." :params="...">` resolves to the localised
  URL via the configured builder ; `useLocaleUrl()` for non-template
  needs ; `withLocale()` stack-builder wrapper pushes
  `route.meta.locale` into `cms.setLocale()` before the inner
  builder runs. Raw paths in qdcms code structurally forbidden.
- `createCms` always-on SignalBus + URL builder slot, with
  `CMS_SIGNALS` constants (`route-changed`, `stack-changed`,
  `auth-changed`, `tenant-changed`, `page-composed`).
- `LangSwitcher` gains a `variant="dropdown"` mode alongside the
  default buttons.

### Changed — `@quazardous/qddebug` (sibling, qdadm-side)

- Debug bar styles isolated under `.qd-debug` root scope so the bar
  embeds in any host without bleed-out / bleed-in.
- Panel-level CSS (signals, toasts, entries, ObjectTree) ported
  from qdadm so qdcms demo gets fully-styled debug panels.

### Demo

- All blocks migrated to `<LocaleLink>` / `useLocaleUrl()`.
- qddebug DebugBar mounted in dev with two cms collectors
  (`CmsContextCollector`, `ComposedPageCollector`) rendered
  through qddebug's `ObjectTree`.
- `cms.setUrlBuilder(buildUrl)` wired pre-mount for first-paint
  safety.
- Vite whitelists qdadm root so qddebug's transitive primeicons
  fonts are served.
