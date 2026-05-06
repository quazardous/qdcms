# qdcms — Optimal Code Structure

**Status**: design target · **Last updated**: 2026-05-06

This document describes the **target shape** of qdcms: how packages
are arranged in the monorepo, how each package is structured, what
the plugin contract looks like, and how an *instance* relates to
the reusable *shell*. It's a north-star for refactors — the current
state may differ; that's a roadmap item (see `roadmap.md` Axis 8).

---

## 1. Guiding principles

1. **An instance is a versioned set of packages, plus bespoke
   bits that survive upgrades.** A site = `package.json`
   manifest of qdcms ecosystem deps + custom plugins / themes /
   configuration owned by that site. The framework deps move
   forward across versions; the bespoke layer stays stable across
   upgrades — that's the whole point.
2. **The two layers must not contaminate each other.** Framework
   packages don't know about a specific instance; instance code
   doesn't reach into framework internals. The contract between
   them is the curated public API of each package (§3).
3. **Public surfaces are curated.** Each package's `index.ts` is
   the contract; everything else is internal and may break between
   minor versions.
4. **Plugins are dual-citizen.** A plugin contributes to BOTH the
   server (entities, routes) and the frontend (blocks, main
   contents, lists, locales) — but ships as ONE npm package.
5. **Upgrades are config-shape changes.** Bumping a shell version
   updates an instance with at most a `CHANGELOG`-driven config
   migration, never a hand-port of bootstrap code. Custom plugins
   and themes follow their own version line.
6. **Sweet spot between "easy code" and abstraction.** A 5-line
   `main.ts` reads instantly but exposes only one extension lever
   (the config). A heavy abstraction survives upgrades better but
   becomes opaque. The instance code sits in between: a small
   number of well-named, documented extension points that *show*
   what the instance can override (root component, App.vue
   template, optional pre-mount hook, custom error page) — the
   rest is owned by the shell. Each extension point is visible
   in the entry file (`main.ts` / `server.ts`), so a reader knows
   the surface without diving into shell internals; but each
   point is also a stable, abstracted seam — surviving shell
   refactors as long as its semantics hold.

The trade-off, made concrete:

| Style                     | Readable? | Upgrade-resilient? | Verdict |
|---|---|---|---|
| 5-line config-only main   | ✅ excellent | 🟡 only if the shell never grows new extension shapes | Too brittle long-term |
| Verbose hand-rolled wiring | 🟡 hard to read | ❌ rewrites every release | Already lost |
| Abstracted hook-points    | ✅ good (entry file is short, points are named) | ✅ shell owns evolution | **Sweet spot** |

In practice, for the SPA shell this means `runQdcmsApp` accepts
named optional callbacks (`{ App, config, beforeMount, errorPage,
shellComponent }`) — not a god-config. Each callback is one
documented extension lever. An instance that doesn't need them
sees only `runQdcmsApp({ App, config })`; one that does sees the
extra lever it needs.

### What lives where (instance-vs-ecosystem split)

| Lifecycle                           | Lives in                                    |
|---|---|
| Bumps with qdcms releases           | `@quazardous/qdcms-*` deps in instance's `package.json` |
| Site-specific custom plugin         | Either a sub-package in the instance repo, or a private npm pkg |
| Site-specific custom theme          | Same — package, not loose files                   |
| Brand assets (logos, fonts, copy)   | Instance's `public/` + per-locale i18n files     |
| Configuration (plugins on, locales, theme id) | `qdcms.config.ts` in instance |
| Domain blocks NOT meant for reuse   | Instance's `src/blocks/` (e.g. Flower-Craft Hero) |
| Framework boilerplate (bootstrap, shells, debug bridge) | Framework shell packages — never duplicated in the instance |

The bespoke layer (custom plugins, custom themes, configs) is what
makes one instance different from another. It's expected to live
unchanged for years across qdcms version bumps; the only friction
is when a `CHANGELOG` flags a config-shape migration.

---

## 2. Repository arborescence

The qdcms monorepo is a **library repository**. It ships
publishable npm packages and nothing else — there's no notion of
"qdcms instance lives in qdcms". An instance is whoever consumes
qdcms's packages, in whatever folder structure they pick. The
framework never dictates where a customer site lives on disk.

For development convenience, the qdcms repo carries an
`examples/` folder with sample consumer apps (the Flower Craft
demo). That's a learning aid, not a contract — drop it, move it,
or rename it without consequence to the libraries themselves.
Vue, Nuxt, Astro, Vite all use this `examples/` convention.

Inside `packages/`, the **frontend / backend / transversal**
split is materialised as subfolders. The split is soft — it
groups what naturally goes together without forcing a hard
division on packages that legitimately serve both sides.

```
qdcms/
├── docs/                              ← architecture & design docs
│   ├── plugins.md                     ← plugin model contract
│   ├── roadmap.md                     ← living roadmap
│   ├── structure.md                   ← this file
│   ├── instance-anatomy.md            ← how an instance is shaped
│   └── qdadm-vue-dedup.md             ← cross-repo dev note
├── scripts/                           ← repo-level dev tooling
│
├── packages/                          ← LIBRARIES (publishable)
│   │
│   ├── ── transversal (env-agnostic, both sides) ──
│   │
│   ├── qdcms-core/                    ← entity, plugin, migration contracts.
│   │                                    No HTTP, no Vue, no Node, no DB.
│   ├── plugins/                       ← qdcms-aware npm packages (dual-citizen)
│   │   ├── qdcms-plugin-core/         ← users, sessions (foundation)
│   │   ├── qdcms-plugin-dc/           ← dynamic content (future)
│   │   └── qdcms-plugin-media/        ← files / images (future)
│   ├── themes/                        ← CSS + optional layout overrides
│   │   ├── qdcms-theme-base/          ← CSS variables baseline
│   │   └── qdcms-theme-*/             ← additional themes
│   │
│   ├── ── frontend (browser runtime + bootstrap) ──
│   │
│   ├── frontend/
│   │   ├── qdcms/                     ← block/zone/page composer + Vue
│   │   │                                registries + components
│   │   ├── qdcms-frontend/            ← ApiFrontendStorage + composables
│   │   ├── qdcms-api-emulator/        ← fetch interceptor for in-tab mode
│   │   └── qdcms-spa-shell/           ← Vue/SPA shell (4-layer pattern,
│   │                                    zone shells, debug bridge)
│   │
│   └── ── backend (Node runtime + bootstrap) ──
│       │
│       └── backend/
│           ├── qdcms-backend/         ← createBackend (Node, MikroORM,
│           │                            plugin discovery via node_modules)
│           │   └── ./browser          ← MemoryStore + dispatcher for
│           │                            in-tab usage (subpath export)
│           └── qdcms-backend-server/  ← Express/HTTP shell
│                                        (reusable, used by every host)
│
└── examples/                          ← SAMPLE CONSUMERS (dev aid, not a deliverable)
    ├── demo/                          ← Flower Craft SPA (frontend example)
    └── demo-backend-server/           ← Flower Craft Node server (backend example)
```

The `package.json` workspace globs cover all the workspace roots :

```json
{
  "workspaces": [
    "packages/*",
    "packages/*/*",
    "examples/*"
  ]
}
```

The `examples/` folder is a **convenience** for the qdcms repo's
own dev cycle — you can build a feature against a working
consumer without leaving the repo. It is not part of what qdcms
ships. A real customer site lives in the customer's own
repository, with whatever folder shape they prefer ; from
qdcms's point of view the only contract is the public API of the
shell packages.

Logic of the grouping inside `packages/` :

- **Transversal at root of `packages/`** — `qdcms-core`,
  `plugins/`, `themes/` are imported by both sides (or by one
  side only depending on the plugin's contributions). Their
  location at the `packages/` root is a signal : "these don't
  belong to a side".
- **`packages/frontend/`** groups the runtime + bootstrap
  packages a browser host pulls : the Vue composer, the storage
  adapter, the emulator, and the SPA shell that wraps them.
  Anything in here imports DOM types and ships in a Vite bundle.
- **`packages/backend/`** groups the Node-side runtime + bootstrap :
  the headless backend, the Express HTTP shell. Imports Node
  types and runs as a process.
- **`instances/`** holds the thin sites — both the SPA and its
  paired Node server. Listed together (not split front/back)
  because an instance is conceptually a *pair* (see §6).

`qdcms-backend/browser` (subpath export) is the one place where a
backend package legitimately produces browser-runnable code : the
in-tab MemoryStore. It stays under `packages/backend/` because
its contracts (entity dispatch, migration model) are backend's —
only the execution location is the browser. Forcing it out of
`backend/` would split a coherent unit just to satisfy folder
purity.

Dependency arrows :

```
                   instances/
                       │
                       ▼
            packages/frontend/ ── ── ── packages/backend/
                  │                            │
                  └──── packages/qdcms-core ───┘
                              ▲
                              │
              packages/{plugins, themes}/* (transversal)
```

Lower layers know nothing of higher ones. Instances depend on
libraries; libraries never depend on instances.

---

## 3. Per-package structure

Every reusable package follows the same internal layout:

```
packages/<pkg>/
├── package.json                  ← name, version, exports map (see §3.1)
├── README.md                     ← what it is, why, minimal usage
├── CHANGELOG.md                  ← every public-API change (see §3.4)
├── tsconfig.json
├── src/
│   ├── index.ts                  ← PUBLIC barrel — the contract
│   ├── <featureA>.ts             ← public symbol(s)
│   ├── <featureB>/
│   │   ├── index.ts              ← public sub-barrel (if subpath export)
│   │   └── <feature-impl>.ts     ← public surface of subpath
│   └── _internal/                ← NOT re-exported, may break anytime
│       ├── helpers.ts
│       └── ...
└── tests/                        ← per-package vitest suites
```

### 3.1 `package.json` exports map

Public subpaths are declared explicitly. Anything not in the
exports map is unimportable from outside (npm enforces it):

```json
{
  "name": "@quazardous/qdcms-spa-shell",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".":               "./src/index.ts",
    "./components":    "./src/components/index.ts",
    "./config":        "./src/config.ts",
    "./testing":       "./src/testing/index.ts"
  }
}
```

### 3.2 Public vs internal

- **Public** — anything reachable through the exports map.
  Documented (JSDoc), versioned (CHANGELOG), tested (snapshot of
  named exports per barrel).
- **Internal** — anything in `src/_internal/` or in a file the
  barrel doesn't re-export. Marked `@internal` if accidentally
  exported. Free to change in any minor version.

### 3.3 Naming

- Packages: `@quazardous/qdcms-<role>` for shells / runtimes,
  `@quazardous/qdcms-plugin-<name>` for plugins,
  `@quazardous/qdcms-theme-<name>` for themes.
- Public type names: prefix with the domain (`QdcmsServerConfig`,
  not `Config`). Avoid generic names that collide on import.
- Public functions: verb-led, parentful (`runQdcmsServer`,
  `createSharedSignalBus`). No bare `init`, `start`, etc.

### 3.4 CHANGELOG discipline

Every public-API change lands a `CHANGELOG.md` entry with:

- Severity — `breaking` / `deprecation` / `feature` / `fix`.
- Migration note — what an instance has to do (config rename, new
  required field, replaced symbol).
- A `@deprecated` JSDoc on the old symbol that survives at least
  one minor before removal.

---

## 4. Plugin structure (dual-citizen)

A plugin is one npm package that contributes to **both** sides.

```
qdcms-plugin-<name>/
├── package.json                    ← name, version, exports map
├── qdcms-plugin.yaml               ← manifest (entities, prefix, deps)
├── README.md
├── CHANGELOG.md
├── locales/                        ← translation files (axis 0 i18n)
│   ├── en.yaml
│   └── fr.yaml
├── upgrades/                       ← migration hints between versions
│   └── 1.x-to-2.0.0.yaml
├── src/
│   ├── index.ts                    ← shared / common (rare)
│   ├── server/                     ← server-side contributions
│   │   ├── index.ts                ← public — backend hooks, routes,
│   │   │                              entity factories
│   │   └── _internal/
│   ├── frontend/                   ← frontend contributions
│   │   ├── index.ts                ← public — registers blocks, lists,
│   │   │                              main contents, page types,
│   │   │                              permissions, debug collectors
│   │   ├── blocks/
│   │   │   ├── <BlockA>.vue
│   │   │   └── <BlockB>.vue
│   │   ├── lists/
│   │   ├── main-contents/
│   │   └── _internal/
│   └── shared/                     ← types / contracts used by both sides
│       ├── permissions.ts          ← permission registry contributions
│       └── types.ts
└── tests/
```

### 4.1 Two entry points in `package.json`

```json
{
  "name": "@quazardous/qdcms-plugin-dc",
  "exports": {
    ".":           "./src/index.ts",
    "./server":    "./src/server/index.ts",
    "./frontend":  "./src/frontend/index.ts",
    "./shared":    "./src/shared/index.ts"
  },
  "qdcms": "qdcms-plugin.yaml"
}
```

- `qdcms-backend-server` (or any Node host) imports
  `@quazardous/qdcms-plugin-dc/server` to register backend hooks.
- `qdcms-spa-shell` (or any browser host) imports the same
  package's `/frontend` subpath to register blocks, main contents,
  permissions, etc.
- Plugin discovery (via the `qdcms-plugin` keyword) finds the
  package; the host imports the relevant subpath.

### 4.2 Plugin lifecycle (extended)

The `qdcms-plugin.yaml` already describes server-side concerns
(entities, extensions, schema). For dual-citizenship the manifest
gains optional metadata about its frontend contributions:

```yaml
prefix: dc
title: Dynamic Content
entities:
  type:
    tableName: types
    fields: { ... }
extensions: {}
frontend:
  blocks:
    story-list: { component: '@quazardous/qdcms-plugin-dc/frontend' }
    story-card: { component: '@quazardous/qdcms-plugin-dc/frontend' }
  mainContents:
    dc-instance: { component: '@quazardous/qdcms-plugin-dc/frontend' }
  permissions: # see roadmap axis 0bis
    - { key: 'dc.<type>.read', label: 'Read DC entries' }
    - { key: 'dc.<type>.write', label: 'Write DC entries' }
  locales: ['en', 'fr']                 # which locales the plugin ships
```

The frontend contributions are loaded lazily by the SPA shell
(via `import('@quazardous/qdcms-plugin-dc/frontend')`) so an
instance only pays the bytes for plugins it actually consumes.

---

## 5. Theme structure

```
qdcms-theme-<name>/
├── package.json
├── README.md
├── src/
│   ├── index.ts            ← exports tokens manifest, optional layouts
│   ├── tokens.css          ← CSS custom properties (--brand-*, --typo-*, …)
│   ├── layouts/            ← optional layout overrides
│   │   ├── DefaultLayout.vue
│   │   └── LandingLayout.vue
│   └── components/         ← optional region/zone overrides
└── styles.scss             ← optional preprocessed entry
```

A theme is consumed by an instance via:

```ts
import { tokens, layouts } from '@quazardous/qdcms-theme-evergreen'
runQdcmsApp({ theme: { tokens, layouts } })
```

Multiple themes can coexist in `node_modules`; the active theme is
either configured statically (instance picks one) or dynamically
(axis 4 level 3 — runtime switcher persisted in DB).

---

## 6. Instance structure (versioned manifest + bespoke layer)

An instance is **not "thin code"** — it's a **manifest of qdcms
package versions** plus a small bespoke layer (custom plugins,
custom theme, config, brand assets) that stays stable while the
framework deps evolve. The instance's `package.json` is the
upgrade lever.

### 6.1 An instance lives wherever you want

There's **no required location** for a qdcms instance. The
conventions in this section describe **filenames and folder names
at the project's root** — `main.ts`, `qdcms.config.ts`,
`blocks/`, `pages/`, etc. — but the project's root itself can be
anywhere. A few legitimate layouts :

- **Single project at repo root** — just clone, `npm init`, drop
  the conventional files alongside `package.json`. No `src/`,
  no wrapper folder. Smallest possible footprint.
  ```
  my-site/
  ├── package.json
  ├── main.ts
  ├── qdcms.config.ts
  ├── App.vue
  ├── style.css
  ├── blocks/
  ├── pages/
  └── content/
  ```
- **Single project in a sub-folder** — same conventions, just
  under a named folder if the repo carries other things.
- **Multi-site monorepo** — your own structure. qdcms doesn't
  dictate it. `examples/<site>/`, `apps/<site>/`,
  `customers/<name>/` — your call.

The qdcms framework only sees what `runQdcmsApp` /
`runQdcmsServer` are called with. Where the call lives on disk
is the consumer's concern.

### 6.2 An instance is conceptually a pair

A deployable instance is conceptually a **pair** of two Node
projects : a **frontend** (the SPA the visitor sees) and a
**backend** (the Node server it talks to). They can be sibling
folders, sub-folders of a same parent, or even completely
separate repositories — qdcms doesn't care.

A naming convention helps when they're side by side :
`<site>/` + `<site>-backend-server/`. Visible in `ls`, no
ambiguity which is which.

The two projects :

- share the **same `qdcms.config.ts`** (or at least the same
  plugin list + locales — likely a shared file imported from
  both),
- pin the **same versions of plugin packages** (drift between
  the two would cause schema mismatches),
- bump qdcms shells **together** (always `npm update` both at
  the same time — diverging versions is a smell).

In dev, a single env var on the SPA flips which backend it talks
to (`VITE_QDCMS_BACKEND_MODE=browser|remote`) — the in-tab bridge
or the Node server. In production the SPA always points at the
real server.

For a lone static-site (no Node server needed), only the SPA
project ships ; the in-tab bridge replaces the server entirely.
The pair degrades gracefully to a single project.

### 6.3 Two bespoke-layout options

Two layouts work for a pair — pick one based on whether the
bespoke bits are shared across multiple sites :

#### 6.3.A In-instance bespoke (single site)

```
instances/<my-instance>/               ← SPA + bespoke for this site only
├── package.json                       ← deps: qdcms-spa-shell, qdcms-plugin-*,
│                                        qdcms-theme-*, plus this instance's
│                                        own private plugins/themes
├── index.html
├── vite.config.ts
├── tsconfig.json
├── main.ts                            ← ~5 lines, calls runQdcmsApp
├── App.vue                            ← ~10 lines (overrides default if needed)
├── qdcms.config.ts                    ← what the app IS:
│                                        plugins, locales, theme id
├── style.css                          ← brand overrides on top of theme
├── blocks/                            ← domain blocks not worth a plugin
├── layouts/                           ← optional custom layouts
├── pages/                             ← optional custom main contents
├── content/                           ← seed / fixtures
├── locales/                           ← translations (axis 0)
├── plugins/                           ← bespoke plugins (this site only)
│   └── flower-craft-content/
│       ├── package.json               ← workspace package, private
│       ├── qdcms-plugin.yaml
│       └── src/                       ← src/ legitimate here — sub-pkg = lib
├── themes/                            ← bespoke themes (this site only)
│   └── flower-craft/
│       ├── package.json
│       └── src/
└── public/                            ← brand assets
```

#### 6.3.B Out-of-instance bespoke (multi-site reuse)

When a customisation should be reused across N sites, promote it
to a real library package under `packages/` :

```
qdcms/
├── packages/
│   ├── plugins/
│   │   └── customer-x-content/        ← bespoke plugin (customer-owned)
│   │       └── ... (plugin layout per §4)
│   └── themes/
│       └── customer-x-theme/
│           └── ... (theme layout per §5)
└── instances/
    ├── site-alpha/                    ← instance, depends on the above
    └── site-beta/                     ← second instance, same deps
```

In both layouts, the instance is dominated by **declarations**
(deps, config, content), not bootstrap glue.

### 6.4 SPA instance — `main.ts` example

A clean instance entry:

```ts
import { runQdcmsApp } from '@quazardous/qdcms-spa-shell'
import App from './App.vue'
import config from './qdcms.config'
import './style.css'
runQdcmsApp({ App, config })
```

### 6.5 Server instance — `server.ts` example

```
<my-instance>-backend/
├── package.json                ← private; deps: qdcms-backend-server,
│                                 qdcms-plugin-* (matching SPA), bespoke server-side plugins
├── .env.example                ← env vars consumed by the shell loader
├── server.ts                   ← ~5 lines (no src/ — instance convention §7.A)
└── tsconfig.json
```

`server.ts`:

```ts
import {
  runQdcmsServer,
  loadConfigFromEnv,
  findQdcmsCore,
} from '@quazardous/qdcms-backend-server'

await runQdcmsServer(loadConfigFromEnv({ corePath: findQdcmsCore() }))
```

Anything else an instance needs (custom routes, middleware, cron
jobs) is handled via `buildServer(config)` instead — the shell
exposes both the one-liner `runQdcmsServer` and the lower-level
`buildServer` for that exact reason.

---

## 6.6 Config-as-code (Drupal-inspired)

> **See [`config.md`](./config.md) for the full spec** — naming
> convention (`qdcms.*.yaml` / `plugin-<short>.*.yaml`), schema
> contract (Valibot, locked / overridable / deprecated), compile
> pipeline (hash + timestamp cache), CMI export/import. The
> rest of this section gives the spatial overview ; details live
> in `config.md`.


Today the instance carries a single `qdcms.config.ts` file. As
the framework grows (DC types, page types, menus, roles, themes),
that file becomes too dense to edit comfortably. Drupal solved
this with `config/sync/*.yml` — one file per concept,
version-controlled, exportable/importable between environments.

qdcms adopts the same pattern, with one twist : **the YAML is
compiled into a typed TS artifact at build time**. Authors edit
human-friendly YAML; the runtime reads a fast, validated JSON
artifact with TypeScript types.

### Layout

```
mon-site/
├── qdcms.config.ts            ← OPTIONAL — only for dynamic tweaks
│                                (env-conditional, programmatic overrides)
└── config/
    ├── locales.yaml           ← active locales + default
    ├── plugins.yaml           ← which plugins are on
    ├── dc-types.yaml          ← DC type declarations (axis 2)
    ├── page-types.yaml        ← page type declarations (axis 1)
    ├── menus.yaml             ← menu trees (axis 6)
    ├── roles.yaml             ← role × permission matrix (axis 0bis)
    ├── theme.yaml             ← active theme + overrides (axis 4)
    └── .compiled/             ← generated, may be gitignored or committed
        ├── index.ts
        ├── locales.ts
        ├── plugins.ts
        └── ...
```

### Two layers : YAML (static) + `qdcms.config.ts` (dynamic tweaks)

- **YAML files in `config/`** — the **static, declarative** truth.
  Drupal-style. Most of the site's configuration lives here.
  Compiled into `config/.compiled/` and loaded automatically by
  the shell — **the user never imports it**. That's internal
  plumbing.
- **`qdcms.config.ts` (optional)** — escape hatch for **dynamic
  tweaks** that don't fit YAML : env-conditional flags,
  programmatic overrides, runtime decisions. Shipped only when
  the instance actually needs it. Absent ⇒ the shell just uses
  the compiled YAML as-is.

```ts
// qdcms.config.ts — optional, only when you need it
// status: instance-owned (rare edits)

export default {
  // Conditionally turn on a plugin per env
  plugins: {
    'qdcms-plugin-debug': process.env.NODE_ENV === 'development',
  },
  // Override default locale for the staging deployment
  locales: process.env.STAGING ? { default: 'en' } : undefined,
  // Programmatic theme overrides not expressible in YAML
  theme: {
    palette: process.env.BRAND_HEX
      ? { primary: process.env.BRAND_HEX }
      : undefined,
  },
}
```

The shell merges this on top of the compiled YAML at boot. The
merge rules are documented and shallow : `qdcms.config.ts`
overrides matching keys in the compiled YAML — never extends
arrays implicitly, never reaches deep into nested structures
without an explicit operator.

Most instances won't have a `qdcms.config.ts` at all — the YAML
covers everything. The file appears only when an instance has
something genuinely dynamic to express.

### Compile at build time, read at runtime

The split is strict :

- **Build time** — a small CLI (shell-provided) walks
  `config/*.yaml`, validates each file against its schema
  (defined by the framework or by plugins), emits typed TS in
  `config/.compiled/`.
- **Runtime** — the shell reads only `config/.compiled/`. **No
  YAML parser ever ships in the bundle.** No validation overhead
  at boot. The runtime artifact is plain TS modules (or JSON)
  that Vite / Node load like any other source.

```sh
qdcms config:compile         # one-shot — build pipeline
qdcms config:compile --watch # dev — rebuild on YAML save, triggers HMR
```

Wired as :
- **`npm run build`** — always runs `qdcms config:compile` before
  `vite build` / `tsc`. Hard fail if YAML is invalid.
- **`npm run dev`** — auto-compiles on start (no need for
  `postinstall`) :
  1. Compile-on-start : if `.compiled/` is missing or stale
     (any YAML mtime > .compiled/index.ts mtime), compile once
     before launching Vite.
  2. Watch in parallel with Vite : YAML edit → re-emit
     `.compiled/` → Vite's HMR picks up the TS module change.

  In effect, a fresh clone runs `npm install && npm run dev` and
  gets a working setup with zero extra step. The `.compiled/` is
  built on demand, transparent to the user.

Why TS modules rather than a single JSON blob :

- Tree-shakeable — a route handler that only needs `menus.ts`
  doesn't pull `dc-types.ts`.
- Type-safe at consumer sites — typed exports per concept.
- Diff-readable when committed — a new menu = one named export
  added.

`.compiled/` is **generated**, not edited. A status header on
each compiled file makes this explicit :

```ts
// status: generated (do not edit) — produced by `qdcms config:compile`
```

CI lint refuses any human edit (compares against compile output).

Trade-off about gitignore vs commit :

| `.compiled/` is …  | Pros                                | Cons                              |
|---|---|---|
| Gitignored (default) | No noise in PRs ; the dev `auto-compile-on-start` regenerates transparently ; clean separation source-of-truth (YAML) vs derived artifact | Build pipeline must run compile before deploying (already enforced by `npm run build`) |
| Committed          | Fresh clone runs even without `npm run dev` ; `git diff` shows admin-driven config changes | PRs carry compiled diff alongside YAML — duplicate signal |

**Default recommendation : gitignore `.compiled/`.** The dev
auto-compile-on-start makes the file transparent for the
contributor : nothing extra to do, no manual step, no diff
noise. The build pipeline guarantees compile before deploy.
Treat `.compiled/` exactly like `dist/` : derived from source,
never committed.

Switch to committed only if a specific need arises (e.g. an
auditor wanting to see the compiled diff alongside the YAML
diff in a PR).

### Trade-offs

| Approach                             | Validation | Speed     | Authoring | Diff readability |
|---|---|---|---|---|
| Single `.ts` file (today)            | TS at edit | runtime ✅| code-y    | OK if small      |
| YAML files, runtime parse            | none       | runtime ❌| great     | great            |
| YAML files, compiled to TS (target)  | compile ✅ | runtime ✅| great     | great            |

The compile step is what makes the YAML approach beat the TS
file on every axis : you get the readable diffs and human-friendly
authoring of YAML, the runtime speed of TS/JSON, and validation
catches errors at compile time (with file/line pointers) rather
than as cryptic runtime failures.

### Drupal alignment

This pattern is what Drupal does, end-to-end :

| Drupal                                 | qdcms                              |
|---|---|
| `config/sync/*.yml` (committed)        | `config/*.yaml` (committed)         |
| `drush config:export` / `:import`      | `qdcms config:export` / `:import` (admin → YAML, future) |
| live config storage (database table)   | runtime config object loaded from `.compiled/` |
| `drush config:status` (drift detector) | `qdcms doctor` checks YAML vs admin DB rows |

The DC plugin's hybrid pattern (statically declared in plugin
yaml + admin-modifiable rows) maps cleanly :
- plugin's `qdcms-plugin.yaml` ships static types,
- instance's `config/dc-types.yaml` adds / overrides,
- admin edits write back to instance YAML when "export" is run,
- the "live" runtime state is the merge.

This is a future axis on its own (Drupal calls it CMI —
Configuration Management Initiative) ; mentioned here so the
file layout above already anticipates it.

---

## 7. Discoverability — "what's mine to touch?"

A new contributor opening an instance repo must answer
**immediately** :

> "Which files am I expected to edit, and which are vendored
> framework code I shouldn't?"

Two layers of signal cover both the steady state and the
transition.

### 7.A Convention : pas de `src/` pour une instance

`src/` est une convention de **bibliothèque** : "voici le source
de ce package, ne le touche pas, importe-le". Pour un consommateur
ça lit comme "hands-off". Une instance qdcms n'est pas une
bibliothèque — c'est un site, dont la totalité du code est censée
être éditée par son auteur. Mettre du code dans `src/` y envoie
le mauvais signal.

**Règle** : une instance n'a pas de dossier `src/` au top-level.
Les fichiers customisables sont à la racine ou dans des dossiers
nommés par leur rôle.

`src/` reste légitime à l'intérieur d'un sous-package (plugin
bespoke, thème bespoke) parce que ces sous-packages SONT des
bibliothèques au sens strict — ils ont un `package.json` avec un
`exports` map, et leur source est consommée par des tiers (la
SPA, le serveur).

### 7.B Two worlds, one boundary

Discoverability rests on a single clean split :

```
  ┌─────────────────────┐         ┌──────────────────────┐
  │   instance/         │  ──→    │   QDCMS_CORE         │
  │   ───────────       │         │   ───────────        │
  │   bespoke uniquement│         │   le code qdcms      │
  │   (App, blocks,     │         │   (packages, plugins,│
  │    config, content) │         │    shell, tooling)   │
  └─────────────────────┘         └──────────────────────┘
```

**An instance contains nothing but its own bespoke code.** All
framework code — packages, shell, plugins, tooling — lives in a
**second world**, the **qdcms repo** (a.k.a. **the core**).

`QDCMS_CORE` is the env var that points the runtime at this
second world. Its physical location is a layout choice, not a
mental-model choice :

| Layout                  | `QDCMS_CORE` value     | When                                          |
|---|---|---|
| **Monorepo dev**        | `..` (parent dir)      | Instance is a sub-folder of the qdcms repo (this repo's `demo/`) |
| **Vendored install**    | `./core` (sub-folder)  | Self-contained instance ships a copy of the qdcms repo as a sub-folder |
| **Shared install**      | `/opt/qdcms` (abs)     | One qdcms repo, many instances pointing at it |

The boundary is **conceptual** in all three cases : even when the
core sits as a sub-folder of the instance, it's another world —
the instance author doesn't edit it. `node_modules/` (where
plugins live, hoisted from the core's workspace install) is part
of that other world too.

This auto-detects in the common case : `findQdcmsCore()` walks up
from `process.cwd()` until it finds a `node_modules` folder and
returns that directory. Override with `QDCMS_CORE=/abs/path` when
the layout is exotic (Docker WORKDIR / deployed bundle).

### 7.C No `core/` folder inside the instance

A previous draft of this doc proposed a `core/` quarantine
**inside** the instance for shell-y code that hadn't yet been
extracted into a shell package. **That was wrong** : it created a
third world (instance × in-instance-core × qdcms repo) where
the model only allows two.

The correct disposition for shell-y code in transit :

- It lives in the **qdcms repo**, under `packages/<some-shell>/`.
  The instance imports it via npm (`@quazardous/qdcms-spa-shell`,
  etc.).
- If a file is currently squatting inside the instance source-tree
  (e.g. `demo/src/bootstrap.ts`), it is **mis-placed**. The fix is
  to extract it to a package in the core, not to relocate it to a
  `core/` sub-folder of the instance.

A clean instance, in any state of the framework's evolution :

```
my-instance/
├── package.json           ← deps (qdcms-spa-shell, plugins, themes…)
├── index.html             ← Vite entry html
├── vite.config.ts         ← build config
├── tsconfig.json
├── .env.example
├── README.md
│
├── main.ts                ← entry (~5 lines: import shell, run)
├── App.vue                ← optional root-template override
├── qdcms.config.ts        ← what the app IS (plugins, locales, theme)
├── style.css              ← brand overrides on top of theme
│
├── blocks/                ← your Vue blocks (Hero, PortfolioGrid…)
├── layouts/               ← optional custom layouts
├── pages/                 ← optional custom main contents
├── content/               ← seed / fixtures
├── locales/               ← translations (axis 0)
├── plugins/               ← bespoke plugins for this instance only
│   └── <my-content>/
│       ├── package.json
│       ├── qdcms-plugin.yaml
│       └── src/           ← THIS src/ is correct — sub-package = library
├── themes/                ← bespoke themes for this instance only
│   └── <my-theme>/
│       ├── package.json
│       └── src/           ← idem
└── public/                ← static assets
```

**At the instance root, names speak.** `blocks/`, `pages/`,
`content/`, `locales/` describe their content directly. A reader
scanning the listing knows exactly what each folder holds without
opening it. Any *file* at the instance root that isn't on this
list is a **smell** — a shell-level concern that leaked into the
instance and needs extracting back to the core.

#### Drupal-aligned naming

Drupal's `core/` (vendored framework code) vs `custom/`
(site-specific code) is a universally legible signal. qdcms borrows
the vocabulary, but applies it at the **right boundary** :

- The qdcms repo (= the world `QDCMS_CORE` points at) is the
  **`core`** in Drupal's sense — vendored framework, hands-off,
  upgraded as a unit.
- **`plugins/custom/`** inside the instance — bespoke plugins for
  this site only. Sibling Drupal idiom : `web/modules/custom/`.
  The implicit `plugins/contrib/` is `node_modules/<plugin>` and
  needs no folder of its own — npm handles it.
- **`themes/custom/`** inside the instance — bespoke themes for
  this site only.

A reader who knows Drupal reads our layout instantly. A reader
who doesn't gets unambiguous English words.

### 7.D Mapping today's `demo/src/` to the target layout

The demo today lives at `qdcms/demo/` (a sub-folder of the qdcms
repo, so `QDCMS_CORE=..`). Most files under `demo/src/` are
bespoke and just need flattening (drop the `src/` wrapper, rename
a couple of folders). The rest are **shell-y** and currently
squat inside the instance — they need to **leave the instance**
and become part of the core's `packages/`.

**Bespoke (stays in the instance, flattens to root) :**

| Today (`demo/src/...`)                  | After (`demo/...`)                               | Status |
|---|---|---|
| `main.ts`                               | `main.ts`                                        | customisable (becomes ~5 lines once shell extracts) |
| `App.vue`                               | `App.vue`                                        | customisable |
| `qdcms.config.ts` (today, monolith)     | `config/*.yaml` + optional thin `qdcms.config.ts` | customisable (split incrementally as new axes land) |
| `style.css`                             | `style.css`                                      | customisable (mixed — tokens migrate to theme later) |
| `blocks/*.vue`                          | `blocks/*.vue`                                   | customisable |
| `layouts/LandingLayout.vue`             | `layouts/LandingLayout.vue`                      | customisable |
| `data/realizations.ts`                  | `content/realizations.ts`                        | customisable |
| `admin/pages/AdminHome.vue`             | `pages/AdminHome.vue`                            | customisable |
| `cms.ts`                                | `cms.ts`                                         | customisable (placements + brand copy + slugTable) |

**Shell-y (leaves the instance, goes to the core's `packages/`) :**

| Today (`demo/src/...`)                  | Target (in `<QDCMS_CORE>/packages/...`)          | Status |
|---|---|---|
| `bootstrap.ts`                          | `qdcms-spa-shell` (orchestration entry)          | shell (to extract) |
| `cms-instance.ts`                       | `qdcms-spa-shell` (CMS wiring)                   | shell (to extract) |
| `services.ts`                           | `qdcms-spa-shell` (DI surface)                   | shell (to extract) |
| `install-demo-backend.ts`               | `qdcms-spa-shell` (in-tab backend bootstrap)     | shell (to extract) |
| `shell/signals.ts`                      | `qdcms-spa-shell` (re-export of qdcore signals)  | shell (to extract) |
| `shell/debugBridge.ts`                  | `qdcms-spa-shell` (qddebug bridge factory)       | shell (to extract) |
| `shell/FrontShell.vue`                  | `qdcms-spa-shell` (front zone shell component)   | shell (to extract) |
| `shell/AdminShell.vue`                  | `qdcms-spa-shell` (admin zone shell component)   | shell (to extract) |
| `admin/install-qdadm.ts`                | `qdcms-spa-shell` (qdadm Kernel bridge)          | shell (to extract) |
| `debug/qdcmsCollectors.ts`              | `qdcms-spa-shell/debug` (or its own package)     | shell (to extract) |
| `debug/CmsContextCollector.ts`          | `qdcms-spa-shell/debug`                          | shell (to extract) |
| `debug/ComposedPageCollector.ts`        | `qdcms-spa-shell/debug`                          | shell (to extract) |
| `debug/StatePanel.vue`                  | `qdcms-spa-shell/debug`                          | shell (to extract) |
| `router.ts`                             | split: `slugTable` → `cms.ts` (bespoke) ; rest → `qdcms-spa-shell` | mixed |

Axis 8 slices the extraction one logical group at a time
(signals/bridge first, FrontShell/AdminShell next, bootstrap and
the debug collectors last). At each step the instance loses files
from its own tree and gains an `import` from
`@quazardous/qdcms-spa-shell`. When all extractions are done the
instance is at steady state — a flat root of bespoke files only.

---

## 8. Dependency graph (target)

```
                          ┌──────────────────┐
                          │   qdcms-core     │
                          │  (no env, no UI) │
                          └────────┬─────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
  ┌──────────────────┐  ┌──────────────────┐    ┌──────────────────┐
  │  qdcms-backend   │  │      qdcms       │    │   qdcms-plugin-* │
  │  (Node + ORM)    │  │ (Vue composer)   │    │   (dual-citizen) │
  └────────┬─────────┘  └────────┬─────────┘    └────────┬─────────┘
           │                     │                       │
           ▼                     ▼                       │
  ┌──────────────────┐  ┌──────────────────┐             │
  │ qdcms-backend-   │  │ qdcms-frontend   │             │
  │     server       │  │ qdcms-api-       │             │
  │ (Express shell)  │  │  emulator        │             │
  └────────┬─────────┘  └────────┬─────────┘             │
           │                     │                       │
           │            ┌────────▼─────────┐             │
           │            │ qdcms-spa-shell  │             │
           │            │ (4-layer + zones)│             │
           │            └────────┬─────────┘             │
           │                     │                       │
           ▼                     ▼                       ▼
        ┌─────────────────────────────────────────────────┐
        │            INSTANCE (thin)                      │
        │   demo-backend-server  ←─→  demo (SPA)          │
        │   ↑ uses backend-server ← /api/qdcms ← uses     │
        │     spa-shell                                   │
        └─────────────────────────────────────────────────┘
```

Lower layers know nothing about higher ones. Plugins float — they
are imported by the layer that actually needs them (server side
for entities, frontend side for blocks).

---

## 9. Upgrade lifecycle (the scenario this structure exists for)

The whole layout exists so this scenario is a non-event:

> Customer X is on `@quazardous/qdcms-spa-shell@1.4.2`. qdcms
> ships `1.5.0`. The customer wants to bump.

Steps in the ideal world:

1. `npm update @quazardous/qdcms-spa-shell @quazardous/qdcms-backend-server`
   in the instance.
2. Read `CHANGELOG.md` of each updated package — look for
   `breaking` or `deprecation` entries.
3. If any: apply the listed config-shape migrations to
   `qdcms.config.ts` (e.g. rename a key, fill a now-required
   field). Each migration note ships with a one-liner rationale
   and the diff shape.
4. `npm run dev` — boot. The shell validates the config; if
   something is still wrong, an actionable error names the field
   and the expected shape.
5. `npm run test` — the instance smoke matrix proves boot + first
   paint + a representative HTTP roundtrip in both backend modes.

What the customer NEVER does on a bump:

- Edit `bootstrap.ts`, `main.ts`, or any wiring code (these
  belong to the shell — the instance owns config, not glue).
- Re-port `installQdadm`, signal-bus setup, debug bridge wiring,
  router fluff. Owned by the shell.
- Patch a regression "from the previous version" by hand. The
  CHANGELOG tells; the doctor CLI confirms; the smoke matrix
  catches.

What the customer's bespoke layer keeps untouched across the bump:

- Their custom plugins (their entities, blocks, main contents).
- Their custom theme (CSS tokens, layout overrides).
- Their `qdcms.config.ts` if no breaking change applies.
- Their content / seed data.
- Their brand assets.

This is the litmus test for every PR that touches a shell
package: does it require a rewrite of bespoke layer code? If
yes → either the change isn't done (find a backwards-compatible
shape) or the CHANGELOG entry must be a `breaking` with a
crystal-clear migration recipe.

---

## 10. Discipline & verification

For the structure to actually deliver upgradeability, mechanical
checks back the rules:

- **Per-package barrel snapshot test** — locks the named exports
  shape; renaming or removing a public symbol fails CI unless the
  snapshot is updated intentionally.
- **No deep-imports lint rule** — any `import '<pkg>/src/...'` or
  `import '<pkg>/dist/_internal/...'` from another package is a
  CI error. The exports map is the only sanctioned surface.
- **Instance smoke matrix** — a small CI matrix that runs each
  instance in both modes (browser-bridge / classic-server) and
  asserts boot + first paint + a representative HTTP roundtrip.
  Catches a public-API regression before instance authors discover
  it the hard way.
- **`qdcms doctor` CLI (future)** — given an instance, parses its
  `qdcms.config.ts` against the current shell's expected shape
  and lists missing / deprecated / extraneous fields.

---

## 11. Migration from current state

The current repo is partially aligned. Snapshot:

| Today                                      | Target                                           |
|---|---|
| `packages/qdcms-core`                      | ✅ already in shape                               |
| `packages/qdcms`                           | ✅ already in shape                               |
| `packages/qdcms-backend`                   | ✅ already in shape (incl. `./browser` subpath)   |
| `packages/qdcms-frontend`                  | ✅ already in shape                               |
| `packages/qdcms-api-emulator`              | ✅ already in shape                               |
| `packages/qdcms-plugin-core`               | ✅ already in shape (single-side; future dual)    |
| `packages/qdcms-backend-server` (started)  | 🚧 finish the split (in-progress slice)          |
| `packages/qdcms-spa-shell` (does not exist)| 🆕 to create — extract from `packages/demo/src/` |
| `packages/qdcms-theme-base` (none)         | 🆕 to create — extract from `demo/style.css`     |
| `packages/demo` (hybrid)                   | 🚧 thin out — push generic bits to spa-shell      |
| `packages/demo-backend-server` (started)   | 🚧 thin out — push generic bits to backend-server |

The migration is the work of roadmap **Axis 8**. It can proceed
incrementally: each extraction is a self-contained slice (move
file, update imports, snapshot test, commit).
