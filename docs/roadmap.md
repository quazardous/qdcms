# qdcms — Roadmap

**Status**: living document · **Last updated**: 2026-05-06

This document maps what qdcms should become beyond the current POC.
It's not frozen — each shipped slice updates the corresponding axis.
Settled decisions are flagged as such; the rest is left in the
*Open questions* section.

---

## 1. Vision — page composition model

A qdcms page is composed of:

- **One main content** — the core, defined by a plugin, that
  - decides the URL pattern,
  - feeds the **active stack** (the context that drives placements),
  - renders the page's central body.
- **Zones** (header, footer, sidebar, hero, …) where plugins place
  **blocks**. A zone is **stackable by default**: multiple blocks
  stacked vertically, ordering driven by `weight`.
- A **layout** that materialises the zones.

A **page type** is the association:

```
page type = { main content, layout, URL pattern (per locale), placements }
```

The Flower Craft demo becomes an *assembly of page types* instead
of a hardcoded wiring — the admin can create / edit these
associations without touching code.

In the current code a "page" is implicit: just a stack level with
`type='page'` consumed by placements. The roadmap makes the
concept first-class.

### Centring principle

**Every page has an active stack — no exception.** The stack is
what placements match against; without it, the page model breaks.
The shape of the stack is what varies between page kinds.

Most pages are centred on **data** — an `item` (single entity
instance) or a `list<item>` (collection):

- `list<item>` page → stack ends on `{ type: 'collection', name }`
- `item` page → stack ends on `{ type: 'item', name, id }`

The main content's role is to shape this stack from the URL.

**Technical pages are a special case, not an exception.** Login,
404, maintenance, dashboard-of-widgets, settings shells, etc.
aren't centred on data, but they still follow the rule of having
a stack — they just use a different discriminator on it
(e.g. `{ type: 'technical', name: 'login' }` or
`{ type: 'auth', flow: 'login' }`).

Practical implications:

- A page type without data still carries a `MainContentDefinition`
  whose `stackBuilder` produces a *technical* stack level.
- Placements work uniformly: a block placed `when: { stack: { top:
  { type: 'technical', name: 'login' } } }` is matched the same
  way as one placed for `{ type: 'item', name: 'realisation' }`.
- Nothing in the framework branches on "is this a real page or a
  technical one" — the stack discriminator carries the difference.

The exact shape of technical-page stack levels is left open (see
*Open questions*).

### Default context / active stack

The cms also needs a **default active stack** — a known stack to
fall back on when no page type matches yet. Concrete cases:

- the very first paint at boot, before the router has resolved
  the initial URL,
- routes that legitimately have no page type (anonymous
  catch-all, error pages without a registered technical page
  type),
- placements that want to match "everywhere unless explicitly
  overridden" — they need a stable baseline to evaluate against.

The home page type's stack is the natural canonical default
(typically `{ type: 'page', name: 'home' }`). Configuration:

- `cms.setDefaultStack(...)` (or via `createCms({ defaultStack })`),
- defaults to the home page type's stack if a page type named
  `home` is registered, otherwise empty.

Useful side-effect: SSR / pre-rendering can produce a meaningful
first frame using the default stack before client hydration takes
over.

---

## 2. Vocabulary (to be ratified)

To add to the qdcms glossary when we tackle axis 1:

- **Main Content** — Vue component exposed by a plugin, defining a
  URL pattern and an active-stack schema. A plugin can expose
  multiple main contents (typically one per content type:
  `realization`, `story`, `category`).
- **Page Type** — recipe for a family of pages: references a main
  content, a layout, a URL pattern (per active locale) and block
  placements.
- **Block** — Vue component placed in a zone. Static or
  parameterised.
- **List** — specialised block for collection rendering (pagination
  / filter / sort props). To be formalised so themes can style
  `list / items` uniformly across all plugins that expose lists.
- **Zone** — named region of a layout. **Stackable by default**.
- **Layout** — Vue component that materialises a page's zones.

See `docs/plugins.md` for the already-ratified vocabulary around
plugins and entities.

---

## 3. Axes (prioritised)

### Axis 0 — i18n first-class (foundational, transversal)

**Settled**: qdcms is multilingual *from boot*, never opt-in.

- **Active locales** configured via the admin. Entity `qdcms_locale`
  (ISO code, label, default flag).
- **Plugins declare their translations** via a documented
  convention:
  - file `locales/<code>.yaml` (or json) inside the plugin,
  - keys namespaced by plugin id (e.g. `dc.story.title`),
  - loaded at boot through the plugin loader.
- **qdcms API** — `cms.t(key)`, composable `useT()`. Backed by the
  shared SignalBus for hot locale switching (already wired through
  `I18N_SIGNALS` in qdcore).
- **Translation coverage** — dev-tool / debug panel that computes
  the matrix `(plugin × locale × key) → present / missing` for each
  loaded plugin. Surfaced in the debug bar (the qdadm i18n panel
  already has a base i18n collector — extend it with the missing-
  key matrix).
- **Page types** — one URL pattern **per active locale** (reuses
  the slug-per-locale machinery from the demo's `slugTable`).
- **DC types** — fields can be flagged **localisable**; instances
  store one variant per active locale.

This axis is transversal — every following axis must comply.

---

### Axis 0bis — Auth (native, optional)

**Settled**: auth is **native** to qdcms (not bolted on as a third-
party plugin), and **optional**: a static site / no-account demo
can run with `auth: false` and never pay the cost. But when it's
on, qdcms ships the implementation — qdadm and downstream plugins
just consume it.

- Foundation already exists: `@quazardous/qdcms-plugin-core` ships
  the `user` + `session` entities. Auth makes them first-class
  citizens of the framework rather than just example tables.
- API:
  - `cms.auth` — singleton with `isAuthenticated`, `currentUser`,
    `login(credentials)`, `logout()`, `roles`,
    `connectSignals(bus)`,
  - `useAuth()` composable for blocks,
  - existing placement condition `when: { auth: true|false }`
    becomes meaningful (it's already typed in the code, not yet
    wired).
- Configuration via `createCms({ auth })`:
  - `auth: false` (or omitted) → no auth wiring; admin runs in
    no-auth mode (current demo state),
  - `auth: { provider: 'core' }` → uses qdcms-plugin-core's user
    / session tables (default DB-session provider),
  - `auth: { provider: customAdapter }` → user-supplied adapter
    (OAuth, SSO, JWT, …).
- **qdadm integration** — when qdcms auth is on, `installQdadm`
  passes `cms.auth` as qdadm's `authAdapter` (instead of
  `features.auth: false` like the current demo). qdadm's login
  page, role guards, and entity-permission filters all read from
  the shared cms.auth.
- **Signal bus integration** — auth events (`auth:login`,
  `auth:logout`, `auth:session-lost`, `auth:role-change`) emit on
  the shared SignalBus. Both zones react.
- Provider plug-points to spec:
  - DB session (cookie-based, qdcms-plugin-core's `session` table),
  - JWT (stateless, useful for SPA + API split),
  - OAuth / OIDC (delegate to identity provider),
  - dev-mode no-auth shim (always-authenticated user, useful for
    integration tests).

#### Permission registry (plugin-declared)

Roles are an aggregation of granular **permissions**. The framework
doesn't hardcode the catalogue — **each plugin contributes the
permissions it cares about** at boot, and the role-builder UI
(axis 3) reads from that registry to let an admin tick / untick
permissions when composing a role.

- API: `cms.auth.registerPermissions(pluginId, [...])`.
- Permission shape:
  ```ts
  {
    key: 'dc.story.read',
    label: 'Read stories',
    group: 'DC: story',          // for UI grouping
    scope?: 'type' | 'field' | 'instance',
    metadata?: Record<string, unknown>,
  }
  ```
- Examples (concrete drivers):
  - **DC plugin** exposes one read/write/delete permission per
    DC type (`dc.<type>.read|write|delete`) and optionally per
    sensitive field (`dc.<type>.field.<name>.write` — e.g. only
    admin can edit `published_at`).
  - **Auth plugin / core** exposes user-management permissions
    (`auth.user.create`, `auth.role.assign`, …).
  - The **i18n** axis exposes locale-management permissions
    (`i18n.locale.create`, `i18n.translation.edit`).

This makes role-building **introspective**: the admin sees only
the permissions actually shipped by the active plugin set — no
phantom permissions, no missing entries.

#### Enforcement is plugin-side (framework supplies the tools)

The framework supplies the **declaration** (registry) and the
**state** (`cms.auth.currentUser`, `cms.auth.hasPermission(key)`)
but does **not** dictate where checks happen. Each plugin chooses
its enforcement strategy — typically a combination, depending on
how exposed the data is:

- **Backend, in or before the API**:
  - HTTP middleware on the route (refuse before the handler
    runs),
  - entity handler check at the start of `list / get / create /
    update / delete`,
  - DB-level row scoping (e.g. `WHERE created_by = :user` for
    instance-scoped permissions).
- **Frontend, after the API**:
  - `ApiFrontendStorage` interceptor (filter rows post-fetch,
    e.g. drop drafts a viewer shouldn't see),
  - qdadm's `EntityManager` (mask fields, hide actions, surface
    "no permission" UI),
  - placement-level `when: { roles: [...] }` (block doesn't
    render if the user's role doesn't qualify).

The framework makes BOTH paths cheap and gives the same predicate
API (`hasPermission` / `hasRole`) on both sides. **Defense in
depth** is encouraged for sensitive data: enforce at the API and
also surface the UI consequence on the frontend, so the user
never sees a forbidden affordance.

A plugin's design decision is "where do I enforce?" — not "can I
enforce?". Examples:

- **DC plugin**: enforces at the API (entity handlers check
  `dc.<type>.read|write|delete`) AND surfaces field masking in
  qdadm's EntityManager for restricted fields.
- A **read-only public plugin**: may enforce only in the
  frontend storage (no API to gate), e.g. hide draft items.
- A **purely-frontend admin tool** that doesn't talk to a backend
  at all: enforces at placement / storage level only.

This axis is transversal — page types may declare auth requirements,
DC types declare per-row ownership and per-field permissions,
themes are auth-blind but the admin-facing parts of axis 3 depend
on it.

### Axis 1 — `Page Type` primitive (foundational)

**Goal**: make the "page" first-class in qdcms.

- Type `MainContentDefinition { name, urlPattern, stackBuilder, component }`.
- API `cms.mainContent(name, def)` — symmetric to
  `cms.block(...)` / `cms.layout(...)`.
- Type `PageTypeDefinition { mainContent, layout, placements? }`.
- API `cms.pageType(name, def)` which:
  - generates the vue-router route from the URL pattern (× active
    locales),
  - wires the main content's `stackBuilder` onto that route.
- **Refactor the Flower Craft demo** to use these page types
  (realisations, services, etc.) — proof by usage.

This is the foundation for axes 2 and 3.

---

### Axis 2 — DC Plugin (hybrid)

**Goal**: let a user declare content types and see them materialise
as main contents + page types.

**Settled**: **hybrid** model — plugin-declared types coexist with
admin-created ones.

- New package `@quazardous/qdcms-plugin-dc`.
- Entities:
  - `dc_type` — declares a DC type (name, fields schema, URL pattern
    template, default layout),
  - **table per type** (already settled: `dc_<type>` created at
    runtime when a type is created or synced).
- **Hybrid rules**:
  - the DC plugin can ship **static** types in its
    `qdcms-plugin.yaml` (= rows seeded into `dc_type` at boot),
  - the admin can create / edit **dynamic** types (DB rows),
  - sync mechanism: at boot, plugin defaults are applied *only*
    when the row doesn't exist yet — admin edits win over plugin
    defaults.
- At boot, the DC plugin:
  - reads active `dc_type` rows,
  - **registers one main content per type** via
    `cms.mainContent(...)` (a generic Vue component renders the
    type's fields),
  - optionally creates a default page type per DC type,
  - **registers permissions** on `cms.auth` (axis 0bis):
    - `dc.<type>.read | write | delete` per type,
    - per-field permissions for fields flagged `restricted: true`
      (e.g. `dc.story.field.published_at.write`).
- **Flower Craft demo**: replace the hard-coded `realization`
  entity with a `realization` DC type. Create / edit via admin.

#### Field types catalogue

DC fields aren't just `{ name: string, value: any }` — they have
a **typed catalogue** so the admin can render appropriate inputs
and the API can validate. Built-in field types:

- **Scalars** — `text` (single line), `longtext` (multiline),
  `markdown`, `integer`, `decimal`, `boolean`, `date`, `datetime`.
- **Choice** — `select` (single, predefined options), `multiselect`.
- **Media** — `file`, `image` (depend on a future media plugin —
  wired but unusable until that lands).
- **Reference** — `ref` to another entity (see below).
- **Composite** — `json` for free-form structured data (escape
  hatch).

Field declaration (example):

```yaml
fields:
  title: { type: text, required: true, localizable: true }
  body:  { type: markdown, localizable: true }
  author: { type: ref, target: 'core.user', cardinality: 'one' }
  category: { type: ref, target: 'dc.category', cardinality: 'one' }
  tags:  { type: ref, target: 'dc.tag', cardinality: 'many' }
  cover: { type: image }
  published_at: { type: datetime, restricted: true }
```

Plugins can register additional field types via
`cms.dc.registerFieldType(name, descriptor)` — descriptor includes
SQL column shape, Vue input component (admin), Vue display
component (front), validator.

#### Entity references

`type: ref` is the load-bearing field type. Without it, content
stays flat (no story-has-author, no story-belongs-to-category).
Specifics:

- `target` — fully-qualified id of another DC type or core entity
  (`dc.<type>`, `core.user`, …).
- `cardinality` — `'one'` (FK) or `'many'` (junction table
  generated as `dc_<type>_<field>`).
- `inverse` — optional reverse-relation alias (e.g. user has a
  `stories: { type: 'reverse', source: 'dc.story.author' }` view).
- Foreign-key cascade: configurable per-ref (`onDelete: 'cascade' |
  'set-null' | 'restrict'`). Default `restrict` to fail loud.
- The qdcms-backend HTTP contract gains query expansion:
  `GET /api/qdcms/entity/dc_story?expand=author,category` joins
  the refs and returns nested objects (single round-trip).

References unlock taxonomy and most real-world content modelling.

#### Built-in DC pattern: Taxonomy

Taxonomy (vocabularies + terms) is a **usage pattern** of DC +
references, not a separate primitive:

- `vocabulary` is a DC type: `{ name, label, hierarchical: bool }`.
- `term` is a DC type: `{ vocabulary: ref, label, parent: ref<term> }`.
- An entity that needs categorisation declares
  `tags: { type: ref, target: 'dc.term', cardinality: 'many' }`.

The DC plugin ships these two types as **statically declared**
(yaml) so they exist at boot regardless of admin actions —
they're load-bearing.

---

### Axis 3 — Admin UI (locales, DC, zones, pages)

**Goal**: qdadm interface to drive the concepts above.

- qdadm module `locale-manager` — configure active locales (axis 0).
- qdadm module `dc-manager` — CRUD on `dc_type` (create, add /
  remove fields, edit URL pattern) + CRUD on instances. Backed by
  qdadm's EntityManager wired to `/api/qdcms/entity/<dc-type>`.
- qdadm module `page-builder` — CRUD on page types: pick main
  content, layout, declare placements (zones × blocks / lists).
  Output: DB rows read by qdcms at boot.
- qdadm module `zone-editor` — preview / debug of a page type's
  zones (dev tool).
- qdadm module `role-builder` — composes roles by ticking
  permissions from the live `cms.auth` registry (axis 0bis). The
  UI groups permissions by plugin (or by `group` field), shows
  per-type / per-field permissions for DC types in their own
  sections, and persists the final `role × permission` matrix in
  the auth backend. Reuses qdadm's existing `PermissionEditor`
  component as a starting point.

---

### Axis 4 — Themes (runtime switcher + admin)

**Settled**: level 3 — runtime switcher with admin.

Stacked levels:

- **Level 1** — extract the demo's CSS tokens into a package
  `@quazardous/qdcms-theme-base` (variables `--brand-*`, typo,
  spacing, radii). The demo inherits. Independent, can start in
  parallel.
- **Level 2** — convention `@quazardous/qdcms-theme-*` for npm
  theme packages (CSS + optional alternative layout / region
  components). Several themes coexist.
- **Level 3** — entity `qdcms_theme` storing the active theme (id)
  + optional overrides (custom palette). qdcms reads it at boot
  and dynamically loads the theme's CSS bundle (Vite dynamic
  import).
- **Level 4** (future) — palette editor in the admin that produces
  override rows.

---

### Axis 6 — Menus & navigation

**Goal**: site navigation as data, not as hardcoded blocks.

Today the demo's `SiteNav` block hardcodes its links. Real sites
need admin-editable menus. Drupal-style menu trees, but
i18n-aware from day one.

- Entity `qdcms_menu` — top-level menu (`id`, `name`,
  `description`, default `region` to render in).
- Entity `qdcms_menu_link` — tree of links:
  - `menu_id` (ref qdcms_menu),
  - `parent_id` (ref qdcms_menu_link, nullable for roots),
  - `weight` (sibling order),
  - `label_<locale>` (one per active locale — uses axis 0
    machinery),
  - target — discriminated union:
    - `{ kind: 'route', name: '...' }` — vue-router route name,
    - `{ kind: 'page-type', id: '...' }` — page type registered
      via axis 1 (the resolver figures out the URL per locale),
    - `{ kind: 'item', entity: 'dc.story', id: '...' }` —
      direct link to a DC instance,
    - `{ kind: 'external', url: '...' }`,
  - `visibility` — auth-aware (`requires_role: '...'`,
    `requires_anonymous: bool`) so the same menu can render
    differently for guests vs logged-in users.
- Block: `<MenuBlock menu="primary" />` — qdcms-shipped block
  that consumes a menu id and renders a tree, locale-aware,
  auth-aware. Themable.
- Admin module (axis 3): `menu-builder` — drag-and-drop tree
  editor.

**Why a dedicated axis** (not a DC type): menus have a different
shape (tree with cross-entity link targets), benefit from
specialised UI (drag-and-drop tree), and are needed by every
site — keeping them out of DC keeps the DC model focused on
content, not navigation.

Depends on: axis 0 (locale-aware labels), axis 0bis (auth
visibility), axis 1 (route resolution from page-type id).
Independent of axis 2 — but DC instance link targets need axis 2
to be useful.

### Axis 5 — Infrastructure (interleavable)

Slices already discussed elsewhere, listed here for visibility:

- `NativeSchemaMigrator` — get MikroORM out of the browser bundle.
- `SqlJsBackendStorage` — real persistent SQL in-browser.
- `qdcms-bridge` — Worker isolating the in-browser backend.
- **Per-plugin HTTP routes** — every plugin declares its endpoints,
  no more auto-CRUD ceiling.
- FK cascade fix in the MikroORM descriptor.

### Axis 8 — DRY instances / reusable shell / clean upgrade path — **priority**

**Goal**: a qdcms instance is **thin** — branding, content, plugin
list, theme — and (almost) nothing else. Anything generic lives
in npm packages. Upgrading an instance means bumping a dep
version, not rewriting bootstrap code.

#### Why this matters

Today the demo's `packages/demo/` is a hybrid:

- **Truly instance-specific** — Flower Craft brand, copy, content
  blocks (`Hero`, `Intro`, `PortfolioGrid`), theme tokens, locale
  list, plugin list.
- **Generic-but-living-here-by-accident** — `bootstrap.ts`,
  `shell/signals.ts`, `shell/debugBridge.ts`, `shell/FrontShell.vue`
  / `AdminShell.vue` skeletons, `install-qdadm.ts`,
  `install-demo-backend.ts`, the 4-layer pattern itself.

The second category should NOT live in `demo/`. Every new qdcms
instance currently has to copy-paste it. Worse, when qdcms ships
a new version with a different bootstrap shape, every instance
has to be patched by hand. That's the upgrade casse-tête.

#### Target shape

Each side of the project gets a reusable shell package, and the
instance shrinks to a config + branding layer:

- `@quazardous/qdcms-spa-shell` — Vue/SPA shell:
  - `runQdcmsApp(config, App)` — opinionated entry that does
    `createApp` + zone shell wiring + bridge install + mount,
  - `createSharedSignalBus()` / `createSharedDebugBridge()`,
  - `<FrontShell>` / `<AdminShell>` Vue components,
  - `installQdadm(app, qdadmConfig)` (already today, just
    relocated),
  - `installDemoBackend(config)` (or split into
    `qdcms-backend-emulator-shell` if needed).
- `@quazardous/qdcms-backend-server` — Node HTTP shell:
  - `runQdcmsServer(config)` — Express wrap + lifecycle,
  - `loadConfigFromEnv(...)`,
  - graceful shutdown helpers,
  - swap-out point for non-Express adapters later.

A demo instance becomes ~10 lines on each side:

```ts
// SPA — packages/<my-instance>/src/main.ts
import { runQdcmsApp } from '@quazardous/qdcms-spa-shell'
import App from './App.vue'
import config from './qdcms.config'
runQdcmsApp({ App, config })
```

```ts
// Server — packages/<my-instance>-backend/src/server.ts
import { runQdcmsServer, loadConfigFromEnv, findQdcmsCore } from '@quazardous/qdcms-backend-server'
runQdcmsServer(loadConfigFromEnv({ corePath: findQdcmsCore() }))
```

Everything else — branding, plugins, theme — is in `qdcms.config.ts`,
`.vue` blocks, and CSS files.

#### Upgrade discipline

- The shell exposes a **stable, versioned config interface**.
  Breaking changes bump major; instances pin a version range.
- Migration notes in `CHANGELOG.md` per shell package — explicit
  shape changes between versions.
- `runQdcmsApp` / `runQdcmsServer` validate config at boot — bad
  configs fail loud with actionable errors, never silent.
- A `qdcms doctor` CLI (future) inspects an instance against the
  current shell version: missing required config, deprecated
  options, etc.

#### Public API discipline (load-bearing)

The whole DRY-instance model only works if **public surfaces are
ultra-curated and explicitly delimited**. Otherwise instances grow
private dependencies on internal helpers and the upgrade path
breaks again.

Rules per package:

- **Curated barrel `src/index.ts`** — exports the intended
  public surface and nothing else. Internal helpers live in
  files NOT re-exported. The barrel is the contract.
- **Subpath exports declared in `package.json`** — e.g.
  `@quazardous/qdcms-spa-shell/components`,
  `.../config`, `.../testing`. Each subpath is a deliberate
  public entry. No deep-importing into source paths from outside
  (that's covered by `package.json`'s `exports` field — it
  enforces the contract at npm-resolution level).
- **Internal modules marked clearly** — file naming convention
  (`_internal/`, `_helpers/`) and/or JSDoc `@internal` markers.
  Anything `_*` is fair game to break between minor versions.
- **Exported types are the contract** — every public symbol has
  a typed signature, named precisely (`QdcmsServerConfig`, not
  `Config`). Exported type aliases over inline shapes when a
  third party might want to spread them.
- **JSDoc on every public export** — what it does, when to use
  it, what it doesn't do. Internal helpers can stay sparse;
  public ones can't.
- **Structural test of the barrel** — a per-package test that
  imports its own `index.ts` and asserts the snapshot of named
  exports. Renaming or removing a public export now fails CI
  unless the snapshot is updated intentionally (= explicit
  breaking-change call).
- **`@deprecated` before removal** — a public symbol marked
  deprecated lives one minor version before being removed.

Mechanically, on each shell package:

```
packages/qdcms-spa-shell/
├── src/
│   ├── index.ts               ← public barrel (the contract)
│   ├── runQdcmsApp.ts         ← public
│   ├── components/
│   │   ├── index.ts           ← public sub-barrel
│   │   ├── FrontShell.vue     ← public
│   │   └── AdminShell.vue     ← public
│   ├── config.ts              ← public (types)
│   ├── _internal/
│   │   ├── debugBridge.ts     ← internal, NOT re-exported
│   │   └── shellMount.ts      ← internal
│   └── ...
├── package.json               ← exports map declares { ".",
│                                  "./components", "./config" }
└── CHANGELOG.md               ← every public-API change is logged
```

The instance side mirrors this: `packages/<instance>/` exports
nothing — it's a private app. Its imports come exclusively from
public shells + plugin packages. Anything custom an instance
needs that's not in a shell's public surface is a flag the shell
is missing a hook.

#### Code-structure analysis (snapshot 2026-05-06)

What in `packages/demo/` is generic and should move down:

| File / folder                          | Move to                          |
|---|---|
| `src/bootstrap.ts`                     | `qdcms-spa-shell` (`runQdcmsApp`)|
| `src/shell/signals.ts`                 | `qdcms-spa-shell`                |
| `src/shell/debugBridge.ts`             | `qdcms-spa-shell`                |
| `src/shell/FrontShell.vue` (skeleton)  | `qdcms-spa-shell` (themable)     |
| `src/shell/AdminShell.vue` (skeleton)  | `qdcms-spa-shell`                |
| `src/admin/install-qdadm.ts`           | `qdcms-spa-shell`                |
| `src/install-demo-backend.ts`          | `qdcms-spa-shell` (or sibling)   |
| `src/cms-instance.ts` boilerplate      | `qdcms-spa-shell` factory        |
| `src/debug/qdcmsCollectors.ts`         | `qdcms-spa-shell`                |

What stays in the instance:

- Brand assets, theme tokens (until Axis 4 lands a theme package).
- `qdcms.config.ts` (plugins, seed, locales).
- Domain blocks (`Hero`, `PortfolioGrid`, …) — these ARE the
  instance.
- `App.vue` if the instance wants to override the shell's default
  template.

Server side, same exercise (already started — this axis pushes it
to completion):

- `packages/demo-backend-server/src/{bootstrap,http,server.config}.ts`
  → all generic, move to `qdcms-backend-server`.
- `packages/demo-backend-server/src/server.ts` → stays, becomes
  ~10 lines.

#### Acceptance

- A new instance scaffold takes < 50 lines of glue (front + back).
- `npm update @quazardous/qdcms-spa-shell` updates an instance
  without code edits, unless a major bump.
- `CHANGELOG.md` of each shell lists every config-shape change
  with a migration note.
- Doc: `docs/instance-anatomy.md` describes the contract between
  shell and instance (what stays, what's pluggable, what's
  optional).

This axis is foundational for any second instance. Keep it on the
critical path.

---

### Axis 7 — Classic backend mode (real Node server) — **priority**

**Goal**: the demo runs end-to-end against a real HTTP server with
**one env var change** (no code edits, no rebuild). Today the
in-browser backend works; the classic toggle exists in
`qdcms.config.ts` (`VITE_QDCMS_BACKEND_MODE=remote`) but the
Node server side doesn't exist yet.

What's needed:

- New package `packages/demo-backend-server` — Express (or
  Fastify) wrapping the existing Node `createBackend` factory:
  - mounts `/api/qdcms/*` and dispatches to `backend.handle(req)`,
  - reads `QDCMS_DB` env var (sqlite path / mariadb DSN / …),
  - reads the same `plugins` list as the demo SPA (shared
    `qdcms.config.ts` import), so DC types / seeds align,
  - runs the migration runner at boot.
- `vite.config.ts` proxy in the demo — when
  `VITE_QDCMS_BACKEND_MODE=remote`, forward `/api/qdcms/*` to the
  Node server (`http://localhost:<api-port>`).
- npm scripts:
  - `npm run server` — boots the Node server (separate process),
  - `npm run dev:full` — runs `concurrently` server + Vite SPA
    (one command for the whole stack).
- Smoke-test the toggle round-trip:
  - default (`VITE_QDCMS_BACKEND_MODE=browser` or unset) → in-tab
    backend, no server needed,
  - `VITE_QDCMS_BACKEND_MODE=remote` → proxy hits the Node server,
    `npm run server` must be running,
  - flip back and forth without code edits.
- Bonus parity check: the same Vite build works in either mode
  (in `remote` mode the in-browser bridge graph drops out — this
  was already verified at ~10 kB gzipped diff).

This axis closes the loop on the IoC story: "the demo natively
supports both modes" stops being a comment in `bootstrap.ts` and
becomes a runnable, smoke-tested truth.

Depends on: nothing — can start now. Doesn't depend on axes 1-6;
their absence just means the server serves the same static
hardcoded entities the SPA today serves via the in-browser
bridge.

---

## 4. Cross-axis dependencies

```
Axis 0    (i18n) ──── transversal ──────→ all axes
Axis 0bis (Auth) ──── transversal ──────→ all axes

Axis 1 (Page Type) ──┬─→ Axis 2 (DC Plugin)
                     │     └─→ field types + refs + taxonomy
                     ├─→ Axis 3 (Admin UI: page-builder, dc-manager,
                     │              menu-builder, role-builder)
                     ├─→ Axis 4 (theme switcher needs layouts)
                     └─→ Axis 6 (Menus — needs page-type resolver)

Axis 4 (theme tokens L1+L2) — independent, can start
Axis 5 — independent, interleavable
Axis 6 (Menus) — depends on 0, 0bis, 1; useful with 2
Axis 7 (Classic backend server) — independent, PRIORITY
```

- **Axes 0 and 0bis** are transversal: every following axis must
  comply with i18n and degrade gracefully when auth is off.
- **Axis 1** is the foundation of the model. Axes 2, 3, 6 depend
  on it. Axis 3 also depends on 2 for `dc-manager` and on 0bis
  for the admin login flow.
- **Axis 4** levels 1+2 are independent; level 3 depends on axis 1
  (to wire the switcher into the composer).
- **Axis 6** depends on axis 1 (page-type → URL resolver per
  locale). DC instance link targets in menus require axis 2.
- **Axis 7** is independent and **priority**: closes the
  in-browser ↔ classic toggle by shipping the missing Node
  server side.

---

## 5. Cross-cutting concern: DB representation of pages / zones / blocks

Once axis 1 makes pages first-class and axis 3 lets the admin
build them, the page-type / zone / block-placement structure has
to be **persisted in the database** (instead of declared in code
as it is today).

The shape of that representation is itself a major design
decision — left open here, to be tackled when axis 1 + axis 3
land:

- **Option A — relational tables**
  - `qdcms_page_type` (id, name, layout_ref, main_content_ref, …),
  - `qdcms_page_url_pattern` (page_type_id, locale, pattern),
  - `qdcms_placement` (page_type_id, zone, block_ref, weight,
    when_json),
  - `qdcms_block_props` (placement_id, key, value).
  - Pros: queryable, integrity-checkable, joinable with other
    tables (DC types, themes).
  - Cons: heavier schema, harder to evolve (each new placement
    field = migration), relational shape doesn't natively express
    nested / conditional structure.

- **Option B — meta blob (JSON / XML)**
  - `qdcms_page_type` (id, name, definition_json), where
    `definition_json` carries the whole tree (zones, blocks,
    placements, when conditions).
  - Pros: free-form, evolves without migrations, shape mirrors
    the Vue-side `PageTypeDefinition` 1:1.
  - Cons: not queryable in SQL, integrity is purely application-
    side, hard to write a SELECT "all pages using block X".

- **Option C — hybrid**
  - Identifying / queryable fields in columns (id, name,
    layout_ref, main_content_ref, locale-specific URL),
  - the placement tree as JSON sub-field.
  - Pros: keeps the high-cardinality querying use-cases (theme
    asks "which page types use my layout?") while keeping the
    nested structure free-form.
  - Cons: two sources of truth — discipline needed to keep them
    in sync.

This is left **open** until axis 1 lands and we have a concrete
`PageTypeDefinition` to serialise. The current best guess leans
toward Option C, but it's a guess.

---

## 6. Open questions

To be settled while tackling the corresponding axis.

- **List / items for theming** — CSS convention (`.qdcms-list`,
  `.qdcms-list__item`)? Vue slot (`<List>` with
  `<template #item="...">`)? To formalise when axis 1 or axis 2
  (first consumer) is ready.
- **DC type changes after instances exist** — if the admin removes
  a field from a DC type, what happens to existing rows (drop
  column? archive?)? To settle while designing the sync.
- **URL pattern syntax** — free DSL (regex-like) or
  Express-style structure (`/foo/:slug`)? Likely the latter to
  stay compatible with vue-router.
- **i18n coverage format** — YAML / JSON / ICU messages /
  vue-i18n-compatible loader? To settle when starting axis 0.
- **Localisable DC fields** — a field flagged `localizable: true`:
  N rows (one per active locale), or one row with a JSON
  `{ fr: ..., en: ... }`? Schema choice — to settle alongside
  axes 0 + 2.
- **DB representation of pages / zones / blocks** — relational vs
  JSON blob vs hybrid (see section 5). To settle when axes 1 + 3
  land.
- **Active stack of technical pages** — what discriminator do
  technical (no-data) pages put on the stack? A flat
  `{ type: 'technical', name }`? A richer shape (`{ type: 'auth',
  flow: 'login' }`)? To settle when axis 1 lands and we have the
  first technical page type to design (probably the admin login).
- **Default auth provider** — DB session via qdcms-plugin-core's
  `session` table is the obvious default, but JWT vs cookie
  session has security trade-offs (CSRF surface, token rotation).
  To settle when axis 0bis lands.
- **Per-row auth on DC types** — should a DC type optionally
  declare `ownerField: 'created_by'` to scope entity permissions?
  Cross-cuts axes 0bis + 2.

---

## 7. Gap analysis vs a Drupal-class CMS

Drupal is the reference for "what a mature CMS does". This section
maps what's covered by the roadmap above versus what's still
missing, ranked by impact. Not every gap is worth filling — some
are out of qdcms's scope by design — but it's healthy to know
what we're explicitly skipping.

### Critical gaps (block core usability)

> Items below marked **"in roadmap"** moved to a dedicated axis
> or sub-axis when the priority was confirmed.

- **Menus / site navigation** — *in roadmap* (Axis 6): admin-
  editable menu trees, locale-aware, auth-aware, with multiple
  link-target kinds (route / page-type / DC instance / external).

- **Field types & entity references** — *in roadmap* (Axis 2,
  sub-spec): typed field catalogue (text, longtext, markdown,
  integer, date, select, file, image, ref, json) + plugin
  registration for custom types. Entity references with
  cardinality, inverse, FK cascade.

- **Taxonomy** — *in roadmap* (Axis 2, built-in pattern):
  vocabulary + term DC types ship with the DC plugin as
  statically-declared types. Built on top of references.

- **Files / Media** — no plan for image upload / management /
  thumbnails / image styles. The Flower Craft demo uses
  hardcoded Unsplash URLs. A real site needs `qdcms-plugin-media`
  with file storage abstraction (local FS / S3 / …) and image
  derivatives. Probably its own plugin, doesn't need to live in
  core.

- **Revisions / history** — Drupal versions every node mutation
  (who, when, what). Roadmap is silent. For a content-driven
  site this is table stakes (rollback bad edits, audit trail).
  Could be a generic mechanism on top of any DC type — opt-in
  via a `revisionable: true` flag on the type.

### Important gaps (operational)

- **Configuration management** — Drupal's CMI exports config as
  YAML to move it between dev / staging / prod. With Axes 1-3
  landing, qdcms's "config" lives in DB rows (page types, DC
  types, role × permission, active locales, theme overrides).
  Needs an export/import mechanism — typically a `qdcms config:export`
  CLI dumping these tables to YAML and the inverse for import.
  Pre-requisite: Axes 1-3 landed first.

- **Path aliases & redirects** — Drupal has admin-editable URL
  aliases (`/node/123` → `/about-us`) and redirect rows
  (301 / 302). Our slug-per-locale per page type covers the
  pattern case but not row-level overrides. Needs `qdcms_alias`
  + `qdcms_redirect` entities and a router middleware.

- **Editorial workflow / moderation** — Drupal Workflow module:
  draft → in review → published, per-entity. Roadmap is silent.
  Probably opt-in per DC type (a state field + transition rules).

- **Search** — Drupal Search API + Solr / ElasticSearch
  integration. Roadmap is silent. At minimum a SQL full-text
  search on DC types, ideally pluggable (search adapter) for
  external engines.

- **Cache tags** — Drupal invalidates rendered output by tag
  (`node:42`, `taxonomy_term:7`). qdcms has signals + composable
  cache hints (qcms-frontend's cache invalidation), but no
  formalised tag-based render-cache. Useful when SSR / output
  caching arrives.

### Nice-to-have (often plugin-shaped)

- **Taxonomy** — vocabulary + hierarchical terms. Plays well as
  a special DC type (each vocabulary = a DC type, each term
  = an instance). Doesn't need first-class framework support if
  DC + entity references land.

- **Views (query builder)** — Drupal's killer feature: an admin
  GUI to compose any list (filters, sorts, exposed filters,
  pagination, displays as block / page / feed). Ours: lists are
  programmatic for now. A true Views equivalent is a major
  product on its own — could be a future plugin
  `qdcms-plugin-views`.

- **Comments / Webforms / SEO toolkit (sitemap, meta tags,
  hreflang)** — each is a candidate plugin. Out of core but
  worth documenting as expected ecosystem pieces.

- **Multisite (one install, many sites)** — Drupal-specific
  pattern. Out of scope for qdcms — the npm + qdcms-backend
  model favours one app per site.

### Where qdcms diverges by design (not gaps)

These aren't missing — they're explicit choices to do things
differently from Drupal:

- **TypeScript-first, npm-pure plugins** — Drupal modules ship
  as zip archives + composer packages. Ours are plain npm
  packages with `qdcms-plugin.yaml`, discovered through
  `node_modules`. Simpler dependency graph, real TS types.

- **Vue 3 SPA front, not server-rendered HTML** — Drupal renders
  on the server by default. qdcms is a client SPA talking HTTP
  to qdcms-backend. SSR / SSG can be added later but isn't the
  default.

- **Backend can run in the browser** — qdcms-backend/browser is
  a unique trait — useful for static-site demos and offline-first
  scenarios. Drupal can't do this.

- **Shared SignalBus across zones** — qcms ↔ qdadm reactivity
  is built-in. Drupal modules communicate via hooks (one-shot)
  and the cache tag system; it doesn't have a live event bus
  spanning frontend + admin in a single SPA.

### Summary table

| Concern                  | Drupal | Roadmap status              | Likely shape       |
|---|---|---|---|
| Content types + fields   | ✅     | Axis 2 (DC plugin)          | Core               |
| Field types catalogue    | ✅     | Implicit in Axis 2          | Detail of Axis 2   |
| Entity references        | ✅     | Not yet                     | Detail of Axis 2   |
| Menus                    | ✅     | Not yet                     | Could fold in Axis 3 |
| Files / Media            | ✅     | Not yet                     | Plugin             |
| Revisions / history      | ✅     | Not yet                     | Opt-in on DC type  |
| Workflow / moderation    | ✅     | Not yet                     | Opt-in on DC type  |
| Search                   | ✅     | Not yet                     | Plugin + adapters  |
| Cache tags               | ✅     | Partial (signals)           | Render-cache layer |
| Path aliases / redirects | ✅     | Not yet                     | Core entity + middleware |
| Configuration management | ✅     | Not yet                     | CLI tooling        |
| Taxonomy                 | ✅     | Solved via DC + refs        | Plugin             |
| Views (query builder)    | ✅     | Not yet                     | Plugin             |
| Comments / Forms / SEO   | ✅     | Not yet                     | Plugins            |
| Multisite                | ✅     | Out of scope                | —                  |
| Backend-in-browser       | ❌     | Shipped                     | Native             |
| Shared event bus         | ❌     | Shipped (SignalBus)         | Native             |
| TypeScript types         | ❌     | Native                      | Native             |

---

## 8. Anchors in the existing codebase

To situate the concepts against current code:

- **Plugin model** — `docs/plugins.md` (settled vocabulary,
  manifest, lifecycle).
- **CMS types** — `packages/qdcms/src/types.ts` (`BlockDefinition`,
  `Placement`, `ComposedPage`, `ContentStackLevel`).
- **CMS API** — `packages/qdcms/src/cms/createCms.ts`
  (`cms.block / place / layout / setStack`).
- **Stack builder** — `packages/qdcms/src/stack/StackBuilder.ts`
  (`declaredStackBuilder`, `StackLevelMetaTemplate`).
- **Composer** — `packages/qdcms/src/composer/PageComposer.ts`
  (`DefaultPageComposer.compose`).
- **Example manifest** —
  `packages/qdcms-plugin-core/qdcms-plugin.yaml`.
- **Demo registrations** — `packages/demo/src/cms.ts` (the
  hardcoded wiring that becomes data once axes 1 + 2 + 3 land).
