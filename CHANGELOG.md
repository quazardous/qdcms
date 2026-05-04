# Changelog

All notable changes to qdcms will be documented in this file.
This is not a commit log. Keep entries simple, user-focused.

## [qdcms-core 0.2.0] - 2026-05-04

### Changed — npm-pure switch (breaking)

qdcms-core now treats npm as the authoritative source for plugin
versioning and dependency resolution. The custom range-validation
and satisfaction-check layer is removed in favour of npm's
`peerDependencies` + lockfile mechanism.

- **Plugin manifest is now SPLIT** between `package.json` (id,
  version, dependencies — npm-managed) and `qdcms-plugin.yaml`
  (prefix, entities, extensions, schemaManaged — qdcms-managed).
  The new `buildManifestFromPackageJson` adapter (subpath
  `@quazardous/qdcms-core/loader`) merges them into the unified
  runtime PluginManifest.
- **Removed** `isValidSemverRange` from `validation` exports.
  `validateManifest` no longer rejects malformed dependency version
  ranges — npm has already validated them at install time.
- **Removed** the `semver.satisfies()` check in
  `InMemoryPluginRegistry.resolveOrder()`. The base impl only does
  topo-sort + cycle + missing-dep detection now. npm enforces version
  satisfaction before our code runs.
- **`isValidPluginId` regex relaxed** to accept npm-scoped names
  (`@scope/name`), digits-first names, and dots (matches npm's own
  package name rules). Old strict variant rejected `@scope/foo`,
  `9core`, `lodash.debounce`-style names.
- **Forbidden in qdcms-plugin.yaml**: `id`, `version`,
  `dependencies` — they belong in package.json. The adapter throws
  with a clear message if they appear in the YAML.

### Added

- `@quazardous/qdcms-core/loader` subpath:
  - `buildManifestFromPackageJson({ packageJson, qdcmsYaml })` —
    npm-pure manifest adapter
  - `defaultIsPluginDependency` — predicate matching qdcms plugins
    by name convention (contains `qdcms-plugin`)

### Tests
- Removed `tests/plugin/semverRanges.test.ts` (33 tests for the
  dropped layer). Total qdcms-core test count: 232 passing.
- Added `tests/loader/packageJsonAdapter.test.ts` — 25 tests
  covering happy path, peer/dependency filtering, custom predicate,
  forbidden YAML fields, validation flow.

### Migration note for hypothetical consumers

If you were importing `isValidSemverRange` from
`@quazardous/qdcms-core/plugin`, switch to checking ranges via
`semver.validRange()` directly (or use npm's own resolution by
declaring deps in `package.json`).

## [qdcms 0.2.0 + qdcms-core 0.1.0] - 2026-05-04

### Added — `@quazardous/qdcms-core` 0.1.0 (initial release, new package)

Plugin/migration/entity framework for qdcms. Initially bootstrapped in `@quazardous/qdcore` (qdadm repo, Phase 1a/1b commits `12a1c6e` + `eb37ae0`) and moved into qdcms-core because the framework is qdcms-centric in practice. See `docs/plugins.md` for the full design.

Subpath exports:
- `./entity` — EntityDescriptor, EntityRegistry, Repository, BackendStorage, FrontendStorage (contracts)
- `./plugin` — PluginManifest, Plugin, `PluginRegistry` contract, `InMemoryPluginRegistry` reference impl, semver-aware manifest validation
- `./migration` — Migration / MigrationRunner / MigrationStore contracts, hashSchema (SHA-256 over canonical JSON), composeSchema (multi-plugin merge), OwnershipTracker (cross-plugin column extension tracking). Node-only (uses `node:crypto`).
- `./sql` — MikroORM-backed concrete impls: MikroOrmBackendStorage, SqlMigrationStore (system table `qdcms_schema_state`), MikroOrmMigrationRunner (compose-then-converge install/uninstall on SQLite). Node-only.

Tests: 152 passing (120 pure-function + 32 SQL integration on temp-file SQLite).
Plugin lifecycle, dependency resolution (topological sort + cycle detection), multi-plugin extensions with ownership-aware selective drop, data preservation across schema changes, idempotence, conflict detection.

Built on MikroORM 6.x as the SQL diff engine. Depends on `@quazardous/qdcore` for SignalBus/Stack types.

### Added — qdcms 0.2.0

- **i18n routing primitives** (`createCms`, `LocaleLink`, `useLocaleUrl`, `withLocale`):
  - `createCms` now bakes in a SignalBus (always-on, not opt-in) and an URL builder slot, with `CMS_SIGNALS` constants for `route-changed`, `stack-changed`, `auth-changed`, `tenant-changed`, `page-composed` events
  - `<LocaleLink name="..." :params="...">` resolves to the right localised URL via the builder; raw paths in qdcms code are structurally forbidden
  - `useLocaleUrl()` composable for non-template URL needs
  - `withLocale()` stack-builder wrapper that pushes `route.meta.locale` into `cms.setLocale()` before the inner builder runs
  - `@quazardous/qdcore` is now a runtime dependency
- **`LangSwitcher` dropdown variant** — same component, `variant="dropdown"` prop in addition to the default `variant="buttons"`

### Changed — `@quazardous/qddebug` (sibling, qdadm 0.2.0 → still 0.2.0 with patch)

- All debug bar styles isolated under `.qd-debug` root scope (CSS reset + namespace) so the bar can be embedded in any host without bleed-out / bleed-in
- Panel-level CSS (signals, toasts, entries, ObjectTree) ported into qddebug from qdadm — qdcms demo gets fully-styled debug panels

### Added — Demo

- All blocks (SiteNav, SiteFooter, PortfolioGrid, RealizationDetail, UserPill, LoginCta, Hero, Breadcrumb) migrated from hardcoded paths to `<LocaleLink>` / `useLocaleUrl()`
- qddebug DebugBar mounted in dev with two cms-specific collectors (CmsContextCollector + ComposedPageCollector) rendered via a thin StatePanel that uses qddebug's ObjectTree
- `cms.setUrlBuilder(buildUrl)` wired before mount to ensure first-paint safety
- `vite.config.ts` whitelists qdadm root so primeicons fonts (transitive dep of qddebug via the file: link) are served
