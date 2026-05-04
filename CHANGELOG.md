# Changelog

All notable changes to qdcms will be documented in this file.
This is not a commit log. Keep entries simple, user-focused.

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
