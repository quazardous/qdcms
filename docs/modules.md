# Modules and plugins

> Status : design doc, not yet implemented. The shape proposed
> here augments qdadm's existing `Module` class (already used
> for qdadm-side modules : `DebugModule`, etc.) with hooks
> qdcms needs (compile-time + backend). Last reviewed 2026-05-06.

qdcms organises every unit of behaviour around a single
abstraction : the **Module**. A Module is a self-contained piece
of the framework with a lifecycle (compile, install, connect,
disconnect) and contributions to the Kernel (entities, migrations,
HTTP routes, config schemas, CLI commands…).

Some Modules are part of the framework itself ; others ship as
standalone npm packages and follow a stricter contract called
**Plugin**.

---

## 1. Two citizenships, one mechanism

A Module instance lives in a **slot** of the Kernel registry,
keyed by its `name`. Two kinds of citizenship :

| Citizenship | Discipline                                                                | API access      | Contract                  |
|---|---|---|---|
| **module**  | Part of a framework package (qdcms-core or sibling) — imported directly   | Can use internal qdcms-core APIs | Loose (just `Module` class) |
| **plugin**  | Public-API only ; satisfies the strict `Plugin` interface, validated at the boundary | Public API only | Strict (`Plugin` interface) |

Both kinds use the same `Module` base class and the same Kernel
lifecycle. The difference is **isolation discipline**, not
behaviour and not distribution.

A plugin is the public version of a module — same mechanism,
stricter contract.

### Distribution is orthogonal

A plugin can ship as :

- a standalone npm package keyworded `qdcms-plugin` — the typical
  case, discovered by the Kernel's npm-walking loader,
- a workspace-internal package (linked via `file:`/workspaces, no
  publish), discovered the same way as long as the keyword is
  there,
- a private file under an instance's `plugins/` directory, picked
  up by a filesystem-scanning loader,
- an explicit list in `qdcms.plugins.yaml` (or the bootstrap
  code), bypassing discovery entirely.

What makes something a plugin is the **shape + discipline** —
the Plugin interface validated at the boundary — not the package
manager that delivered it.

### Why distinguish

- **Stability vs evolution** : modules are version-locked to the
  framework ; plugins evolve at their own semver pace (whatever
  cadence their loader/source dictates).
- **Trust boundary** : modules can poke into qdcms-core
  internals ; plugins must stick to the public surface so
  framework refactors don't silently break them.
- **Validation surface** : modules trust the framework to import
  them correctly ; plugins are validated at the discovery
  boundary (Valibot, see §8) because the loader can't trust
  whoever produced the value.

### Promotion path

A module can be **promoted to a plugin** when external
alternatives become useful : extract its impl into its own
package (npm-published or workspace-internal), expose it through
the Plugin interface, version it independently. The Module's
class doesn't change ; its packaging + the discipline around
it does.

The reverse — **demoting a plugin to a module** — happens when a
plugin's behaviour becomes considered framework-essential and
stops being something an instance might want to swap out. Rare,
but possible.

---

## 2. The Module class (augmented from qdadm)

qdadm already exposes a `Module` base class used by its own
internals (`DebugModule`, etc.). qdcms re-uses it and adds the
hooks it needs — backend (entities, migrations, HTTP routes) and
compile-time (config schemas, CLI commands).

```ts
abstract class Module {
  // ─── Identity ──────────────────────────────────────────────
  static moduleName: string                    // 'config', 'auth', …
  static requires: readonly string[]           // names this module depends on
  static priority: number                      // load order tiebreak

  // ─── Compile-time hooks (qdcms additions) ──────────────────
  static configSchemas: NamespaceSchema[]      // validators for config files
  static cliCommands: string | null            // path to oclif commands dir

  // ─── Backend runtime hooks (qdcms additions) ───────────────
  static entities: EntityDescriptor[]          // DB tables (qdcms-core/entity)
  static migrations: Migration[]               // DDL (qdcms-core/migration)
  registerHttpRoutes?(router: ExpressRouter): void
  install?(ctx: BackendContext): Promise<void>
  uninstall?(ctx: BackendContext): Promise<void>

  // ─── Frontend runtime hooks (qdadm-existing) ───────────────
  static styles: (() => Promise<unknown>) | null
  connect?(ctx: FrontendContext): Promise<void>
  disconnect?(): Promise<void>

  // ─── Common ────────────────────────────────────────────────
  enabled?(ctx: KernelContext): boolean
}
```

All hooks are optional. A frontend-only module (qdadm style) can
ignore the backend ones ; a backend-only module (qdcms's
ConfigModule, BackendServerModule) can ignore the frontend ones.

### Lifecycle

```
                ┌────────────────┐
                │  Module class  │
                └────────┬───────┘
                         │
                    ┌────▼────┐
                    │ enabled │  ← runtime check (skip if false)
                    └────┬────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   compile-time     backend boot      frontend boot
        │                │                │
   register schemas install + register   loadStyles + connect
        │           HTTP routes           │
   register CLI                           │
        │                │                │
        └─────── disconnect / uninstall ──┘
```

Each phase is invoked by the appropriate runtime :
- **compile-time** : the `qdcms config:compile` CLI walks the
  Kernel and collects every module's `configSchemas`.
- **backend boot** : the `qdcms-backend-server` Express shell
  walks the Kernel and calls each module's `install()` (if
  needed) then `registerHttpRoutes()`.
- **frontend boot** : the `qdcms-spa-shell` (Vue side) walks the
  Kernel and calls each module's `connect()`.

A module that has no relevance to a phase simply provides no
hook for it.

---

## 3. The Plugin interface (public contract)

A plugin is a Module that ALSO satisfies a strict, versioned
public contract :

```ts
export interface Plugin {
  // Identity — npm-unique, stable.
  readonly id: string                          // '@quazardous/qdcms-plugin-auth-oauth'
  readonly version: string                     // semver
  readonly prefix: string                      // 'auth_oauth' (table + config-file prefix)

  // Role identity — what this plugin "is" to dependants.
  readonly name: string                        // 'auth-oauth' — slot key in the kernel

  // Topology in the kernel registry.
  readonly requires?: readonly string[]        // names this plugin needs
  readonly replaces?: readonly string[]        // names this plugin overrides
  readonly weight?: number                     // chain order when multiple
                                               // plugins replace the same slot ;
                                               // higher = outer (active). default 0.

  // Contributions — strict shape, validated at install.
  readonly configSchemas: readonly NamespaceSchema[]
  readonly entities: readonly EntityDescriptor[]
  readonly migrations: readonly Migration[]

  // Optional : config schemas to retire when this plugin
  // replaces another. Default behaviour is to KEEP all the
  // replaced party's schemas active — this opt-out marks the
  // ones the new impl doesn't honour. See §4 schema inheritance.
  readonly dropsConfigSchemas?: readonly string[]

  // Hooks — same shape as Module's hooks.
  install(ctx: PluginInstallContext): Promise<void>
  uninstall(ctx: PluginInstallContext): Promise<void>
  registerHttpRoutes?(router: ExpressRouter): void
  registerVueRoutes?(router: VueRouter): void
  connect?(ctx: FrontendContext): Promise<void>
  disconnect?(): Promise<void>
}
```

The interface :

- **Frozen within a major** : breaking changes here bump
  qdcms-core's major version. Plugins pin a compatible range.
- **Validated at boundary** : the loader runs Valibot against
  every discovered plugin's package metadata + module export.
  Malformed plugins are rejected with file:line errors.
- **Documentation is the code** : the TS interface is the spec.
  `docs/plugins.md` (if it remains separate) just narrates ;
  this file is canonical.

A plugin implementation typically looks like :

```ts
// packages/qdcms-plugin-auth-oauth/src/OAuthPlugin.ts
class OAuthPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-auth-oauth'
  readonly name = 'auth-oauth'
  readonly prefix = 'auth_oauth'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly replaces = ['auth'] as const
  readonly weight = 10

  readonly configSchemas = [oauthProvidersSchema]
  readonly entities = [oauthSessionEntity, oauthProviderEntity]
  readonly migrations = [oauthInitialMigration]

  async install(ctx) { /* run migrations + register providers */ }
  async uninstall(ctx) { /* drop oauth tables */ }

  registerHttpRoutes(router) {
    router.get('/api/qdcms/auth/login/oauth/:provider', this.startHandler)
    router.get('/api/qdcms/auth/callback/oauth/:provider', this.callbackHandler)
  }
}
```

---

## 4. Override mechanism (`replaces`)

A plugin can take the slot of any other already-registered name
(module OR plugin) by declaring `replaces: ['<name>']`. The
Kernel layers the plugin **on top** of the previous occupant —
both instances stay alive ; the new one becomes the **active**
slot occupant, the previous one becomes accessible to it via a
helper (see §4.4).

`replaces` accepts multiple names — a single plugin can
**consolidate several roles** :

```ts
// Replaces three native modules with one Elastic-backed impl.
class ElasticSearchPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-elastic'
  readonly name = 'elastic'
  readonly prefix = 'elastic'
  readonly replaces = ['search', 'indexer', 'fulltext'] as const
  // …
}
```

After registration, the Kernel's registry exposes the plugin as
the **active** instance under all the relevant names :

```
kernel['elastic']  = ElasticSearchPlugin   // its own slot
kernel['search']   = ElasticSearchPlugin   // active in slot 'search'
kernel['indexer']  = ElasticSearchPlugin   // active in slot 'indexer'
kernel['fulltext'] = ElasticSearchPlugin   // active in slot 'fulltext'
```

Modules that depend on `requires: ['search']` continue to
resolve correctly — they get the active instance. The
consolidation is transparent.

### 4.1 Chain semantics and `weight`

Multiple plugins **can** replace the same slot. The Kernel
orders them by `weight` (ascending) and builds a chain :

```
slot 'auth'
  ├─ PasswordAuthModule       (citizenship='module', weight=0,  base)
  ├─ AuthMFAPlugin            (replaces=['auth'],    weight=10)  ← wraps password
  └─ AuditLogAuthPlugin       (replaces=['auth'],    weight=20)  ← active, wraps MFA
       ▲
       └─ kernel.get('auth') returns this one — outermost wins.
```

The **active** instance for a slot is the highest-weight entry
in its chain. That instance is what dispatches user-facing
hooks (HTTP routes, frontend `connect`). Predecessors stay
alive in the chain and are reachable via the kernel helper —
they don't register routes themselves once superseded.

`weight` defaults to `0`. The base (un-replaced) entry behaves
as the bottom of the chain. Plugins that wrap a role pick a
weight high enough to land above the base ; if several wrappers
co-exist, they pick weights to express their layering intent.

### 4.2 Conflict detection

- Two plugins replacing the same slot with **the same weight**
  → fatal at boot (`"plugins '@x/foo' and '@y/bar' both replace
  'auth' with weight=10 — disambiguate via weight"`).
- A plugin that `replaces: ['inexistent']` → warning, plugin
  runs additively under its own name (no chain to attach to).
- A plugin's `requires` not satisfied after replace resolution
  → fatal.
- A `replaces` cycle (A replaces B, B replaces A) → fatal at
  boot. Cycles can't form via `replaces` alone (each plugin's
  replaces list is static), but combined with weight ties they'd
  produce ambiguous chains — caught by the same-weight check.

### 4.3 Schema inheritance on replace

Override moves the **runtime slot** but **keeps the replaced
party's `configSchemas`** registered in the compile-time
registry. The rationale : a plugin that replaces `auth` is
declaring "I take over the role" — and that role comes with the
existing config surface (e.g. `auth.cookies-options`,
`auth.session-ttl` files the user has already written and the
admin has filled). The active plugin reads them via the
shared config registry.

In a multi-replace chain, schemas accumulate from the bottom up :
each layer keeps its predecessors' schemas registered (minus
anything explicitly dropped via `dropsConfigSchemas`).

### 4.4 Accessing the replaced instance (kernel helper)

When a plugin wants to **wrap** the predecessor it replaces —
typical decorator / MFA-on-password pattern — it does NOT
instantiate the predecessor itself. The Kernel already holds an
instance of every entry in the chain ; the plugin just asks for
it via the install/runtime context :

```ts
class AuthMFAPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-auth-mfa'
  readonly name = 'auth-mfa'
  readonly replaces = ['auth'] as const
  readonly weight = 10                       // sits above the base auth

  async install(ctx) {
    // ctx.replaced(slotName) returns the immediately-below
    // instance in the chain (the predecessor this plugin
    // wraps), or undefined if there is none.
    const inner = ctx.replaced('auth')
    await inner?.install?.(ctx)              // delegate base setup
    await this.addMfaSecretColumn(ctx)
  }

  registerHttpRoutes(router, ctx) {
    router.post('/api/qdcms/auth/login', async (req, res) => {
      const inner = ctx.replaced('auth')     // same helper at runtime
      const user  = await inner.verifyCredentials(req.body)
      // …add MFA challenge on top
    })
  }
}
```

Helper API on `ctx` :

| Helper                          | Returns                                          |
|---|---|
| `ctx.replaced(slot)`            | Immediately-below instance in the slot's chain (or `undefined`) |
| `ctx.replacedChain(slot)`       | Full chain, bottom-to-top, EXCLUDING the caller  |
| `ctx.kernel.get(slot)`          | Active (top-of-chain) instance for the slot      |

The wrapping plugin remains agnostic about who its predecessor
actually is — could be the framework's default
`PasswordAuthModule`, could be another plugin
(`@x/qdcms-plugin-auth-cookies`), could be a chain of two. As
long as the predecessor honours the role's contract, wrapping
works.

**No npm dependency on the wrapped package.** The wrapper does
not `import { CookiesAuthPlugin } from '...'` — it talks to its
predecessor purely through the shared role contract (the
methods declared by the slot's interface). That keeps the
wrapper portable across implementations.

### 4.5 Compose vs replace

Two distinct intents :

- **Compose** (additive) : a plugin adds a new role to the
  kernel — `replaces` is empty, everyone keeps their slot.
  Example : a `qdcms-plugin-search-meilisearch` adds a fresh
  `meilisearch` role consumed by other plugins via `requires`.
- **Replace** (chain) : a plugin layers on an existing slot —
  it appears in the slot's chain at its declared `weight`. The
  existing occupant is not destroyed ; it just stops being the
  active one for that slot.

The Kernel always preserves the chain. There's no
"unregister-then-register" — `replaces` is a layering operator,
never a destruction operator.

### 4.6 Drop / extend at the role level

The active plugin can :

- **Inherit silently** : do nothing, the replaced schemas stay
  registered, instance YAML files still validate, the plugin
  reads them via `ctx.config.get('auth.…')` as needed.
- **Extend** : declare its own `configSchemas` (additional
  files / concepts the user can author).
- **Drop** : declare `dropsConfigSchemas: ['auth.legacy-thing']`
  to mark a schema as unused by the chain's active impl. The
  compile pipeline emits a deprecation warning if the user
  still has YAML for it ; after one major bump, the schema is
  unregistered and the YAML is rejected.

```ts
class OAuthPlugin extends Module implements Plugin {
  readonly replaces = ['auth'] as const
  readonly weight = 10
  readonly configSchemas = [oauthSchema]
  readonly dropsConfigSchemas = ['auth.password-policy'] as const   // OAuth doesn't honour this
}
```

This makes plugin replacement **non-destructive by default** —
the user's existing config keeps working under the new
implementation, with explicit opt-out for the parts the new
impl doesn't honour.

### 4.7 Module override : allowed but unusual

Replacing a slot whose current occupant has citizenship
`'module'` is **allowed** but **unusual**. Modules are typically
stable framework pieces ; if you find yourself replacing one
often, ask : should this module be promoted to a plugin so
override becomes first-class ?

The Kernel doesn't gate module replacement technically — the
restraint is social, documented here.

### Naming convention for `requires`

Prefer requiring **role names** over **specific implementations** :

```ts
// good : depend on the role
readonly requires = ['auth'] as const

// brittle : depends on a specific impl
readonly requires = ['auth-superpro'] as const
```

A `requires` on a role is satisfied by whoever fills the slot
(default module, override plugin A, override plugin B). A
`requires` on a specific impl ties you to that impl's existence
— legitimate when you need its extra surface, but document why
in a comment.

---

## 5. The Kernel

```ts
interface ChainEntry {
  readonly instance: Module
  readonly citizenship: 'module' | 'plugin'
  readonly origin: string                    // 'qdcms-core' or '@x/qdcms-plugin-Y'
  readonly weight: number
}

interface Slot {
  readonly name: string
  readonly chain: readonly ChainEntry[]      // bottom-to-top, sorted by weight
  readonly active: ChainEntry                // == chain.at(-1)
}

class Kernel {
  // Registration (called in order : modules first, then plugins
  // in topo-sorted order).
  registerModule(m: Module): void
  registerPlugin(p: Plugin): void

  // Access.
  get(name: string): Module | undefined         // active instance for the slot
  slot(name: string): Slot | undefined          // full chain
  list(): readonly Slot[]
  replaced(name: string, caller: Module): Module | undefined
                                                // immediate predecessor of caller
                                                // in the slot's chain

  // Boot — applies the full pipeline (validate, topo, register).
  boot(input: KernelInput): Promise<void>
}
```

`boot()` runs the orchestration described in §4 :

```
1. Register internal modules (citizenship = 'module', weight=0)
2. Resolve enabled plugins from qdcms.plugins.yaml + discovery
3. Validate plugin contracts (Valibot)
4. Detect chain conflicts (same slot + same weight from two
   different plugins)
5. Topo-sort plugins by `requires` (using each slot's active
   instance to satisfy `requires`)
6. Apply : for each plugin in topo order, append to the chain
   of every slot in its `replaces` list (sorted-insert by weight)
7. Run lifecycle hooks per phase :
     - install : bottom-to-top across each chain (every entry,
       so wrappers run AFTER their predecessor's setup)
     - registerHttpRoutes / connect : active (top of chain) only
     - uninstall : top-to-bottom (mirror order)
```

The Kernel maintains the chain invariant : `slot.active === slot.chain.at(-1)`.
Predecessors stay alive and addressable via the `replaced`
helper. They do not register routes/hooks themselves once
superseded — the active instance owns the slot's external
surface and chooses whether/how to delegate to predecessors.

Cycles in `requires` → fatal with the cycle path printed.
Unsatisfied `requires` → fatal with the missing slot name.
Same-weight collision in a chain → fatal (see §4.2).

---

## 6. Concrete module/plugin examples

### 6.1 ConfigModule (internal — citizenship 'module')

```ts
class ConfigModule extends Module {
  static moduleName = 'config'
  static priority = -100              // load before everything

  static configSchemas = [
    qdcmsLocalesSchema,
    qdcmsPluginsSchema,
    qdcmsSlugTableSchema,
  ]
  static cliCommands = './cli/commands'  // config:compile, config:doctor

  static entities = [qdcmsConfigLive]   // DB-backed live overrides (C9)

  registerHttpRoutes(router) {
    router.post('/api/qdcms/config/export', this.exportHandler)
    router.post('/api/qdcms/config/import', this.importHandler)
    router.get('/api/qdcms/config/status', this.statusHandler)
  }

  async install(ctx) {
    // Run migrations for qdcms_config_live
  }

  async connect(ctx) {
    // Provide compiled config to Vue app
    ctx.provide('config', ctx.loadCompiled())
  }
}
```

This module is **never replaced** — it's part of the framework's
foundation. If a fancier compiler arrives, it'd be a separate
plugin (`qdcms-plugin-config-compile-rust`) that replaces only
the compile-time bits.

### 6.2 DCModule (internal — citizenship 'module')

```ts
class DCModule extends Module {
  static moduleName = 'dc'
  static requires = ['config']

  static configSchemas = [dcTypesSchema, dcFieldsSchema]
  static entities = [dcTypeEntity]
  static migrations = [dcInitialMigration]

  async install(ctx) {
    // Apply migrations + seed default types from
    // qdcms-core/config/install/dc.types.yaml
  }

  registerHttpRoutes(router) {
    router.get('/api/qdcms/entity/dc/:type', this.handler)
    router.post('/api/qdcms/entity/dc/:type', this.handler)
    // …
  }
}
```

DC is a **first-class qdcms concept**, not an opt-in plugin. Page
types compose around main contents that DC produces ; without it
the framework's content model has nothing to display. So it ships
inside qdcms-core with `citizenship='module'`, version-locked to
the framework, no Plugin-interface validation needed.

If a future requirement asks for a swappable DC backend (e.g. a
headless-CMS-backed alternative), that arrives as a Plugin with
`replaces: ['dc']` — DC gets promoted to a slot that accepts
override at that point.

### 6.3 ElasticSearchPlugin (consolidates multiple roles)

```ts
class ElasticSearchPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-elastic'
  readonly name = 'elastic'
  readonly prefix = 'elastic'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly replaces = ['search', 'indexer', 'fulltext'] as const

  // Single impl covers what was 3 native modules.
  readonly configSchemas = [elasticConfigSchema]
  readonly entities = [/* index_state, doc_meta, … */]

  registerHttpRoutes(router) {
    router.get('/api/qdcms/search/:query', this.queryHandler)
    router.post('/api/qdcms/index/:type', this.reindexHandler)
  }
}
```

Modules that `requires: ['search']` continue to resolve correctly
post-override. The instance gets a more performant impl in one
opt-in.

### 6.4 OAuthPlugin (drop-in auth replacement, no wrap)

```ts
class OAuthPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-auth-oauth'
  readonly name = 'auth-oauth'
  readonly prefix = 'auth-oauth'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly replaces = ['auth'] as const
  readonly weight = 10                     // sits above the base auth

  // Doesn't delegate to the predecessor — full re-impl of the
  // role. Routes installed here own /api/qdcms/auth/* outright.
  readonly entities = [oauthSessionEntity, oauthProviderEntity]
  readonly migrations = [oauthInitialMigration]

  registerHttpRoutes(router) {
    router.get('/api/qdcms/auth/login/oauth/:provider', this.startHandler)
    router.get('/api/qdcms/auth/callback/oauth/:provider', this.callbackHandler)
  }
}
```

`requires: ['auth']` consumers (DC, admin UI) work transparently
with this plugin active for the slot.

### 6.5 AuthMFAPlugin (wrapping plugin, uses the helper)

```ts
class AuthMFAPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-auth-mfa'
  readonly name = 'auth-mfa'
  readonly prefix = 'auth-mfa'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly replaces = ['auth'] as const
  readonly weight = 20                     // above any base / OAuth replacer

  readonly configSchemas = [mfaSchema]
  readonly entities = [mfaSecretEntity]

  async install(ctx) {
    // Don't reach for the predecessor's class via npm — ask
    // the kernel for whoever sits below us in the chain.
    await ctx.replaced('auth')?.install?.(ctx)
    await this.runMigrations(ctx)
  }

  registerHttpRoutes(router, ctx) {
    router.post('/api/qdcms/auth/login', async (req, res) => {
      const inner = ctx.replaced('auth')!         // chain guarantees it
      const user  = await inner.verifyCredentials(req.body)
      if (this.requiresMfa(user)) return this.challenge(res, user)
      return this.completeLogin(res, user)
    })
  }
}
```

Notice the wrapper has **zero npm dependency** on the wrapped
plugin — it talks to its predecessor through the role contract,
whoever happens to be in that chain entry.

---

## 7. Where modules and plugins live on disk

Layout (per `structure.md`) :

```
qdcms/
├── core/
│   └── packages/
│       ├── qdcms-core/
│       │   └── src/
│       │       ├── module/                ← Module base class, Kernel
│       │       ├── plugin/                ← Plugin interface + loader
│       │       ├── config/                ← ConfigModule (internal)
│       │       └── ...
│       ├── qdcms-backend-server/          ← BackendServerModule (internal)
│       └── qdcms-spa-shell/               ← SpaShellModule (internal, future)
│
├── packages/                              (future — plugin packages would be elsewhere,
│                                           NOT in qdcms repo : a plugin's repo is its own)
│
└── demo/                                  ← instance, lists enabled plugins in
                                            config/qdcms.plugins.yaml
```

A plugin package (e.g. `@quazardous/qdcms-plugin-auth-oauth`)
lives in its own git repo + npm package — never inside
qdcms-core. Modules ship inside qdcms-core packages.

---

## 8. Discovery and validation

At boot, the runtime walks `<QDCMS_CORE>/node_modules/` for
packages keyworded `qdcms-plugin`. For each :

1. Read `package.json` and validate it has the right keyword +
   an `oclif.commands` entry (if it ships CLI commands).
2. Dynamic-import the plugin's main entry, expect an instance
   of a class extending `Module` and implementing `Plugin`.
3. Run Valibot validation on the instance against `PluginSchema`.
4. Reject malformed plugins with a clear error :

```
[qdcms-kernel] plugin '@x/qdcms-plugin-foo' rejected :
  - prefix must match /^[a-z][a-z0-9-]*$/, got '_FOO'
  - configSchemas[0].namespace must equal `plugin-foo` to match prefix
  - requires must be an array of strings, got null
Source : @x/qdcms-plugin-foo/package.json + dist/index.js
```

The instance is rejected entirely — no half-loaded state.

---

## 9. Design choices not yet locked

The following are reserved in the contract but not yet
implemented :

- **Module override mechanism** : technically allowed but
  unusual ; if module replacement becomes a real need, we'll
  formalise lockdown / unlockdown patterns. Today : ignored at
  runtime, no fatal, no special handling.
- **Plugin version compat range** : the `version` field is in
  the contract but the loader doesn't yet enforce semver ranges
  declared in `qdcms-plugin.yaml`. Future : `qdcms install`
  validates against an explicit `peerCompatible: '^1.0.0'`
  field.
- **Plugin uninstall** : when an admin disables a plugin, what
  happens to its `<prefix>.*.yaml` files in the instance ? The
  Kernel doesn't yet drive this — `qdcms plugin:disable` (a
  future CLI command) will own the workflow, with a prompt for
  the YAML disposition.
- **Module composition** : a plugin can declare multiple
  internal modules (sub-modules) ? Not in the current contract.
  Defer until a concrete need.

---

## 10. Migration plan

The current state of the codebase has :

- Loose `compileConfig` / `validateConcept` in
  `qdcms-core/src/config/` — works, but not Module-shaped.
- qdadm's `Module` class for frontend (debug, etc.) — works.
- Plugin discovery in `qdcms-cli` for CLI commands only — works
  but limited to oclif command merging.

The path to the design above :

**Slice M1 — Module class augmentation (qdcms-core)**
Extend qdadm's `Module` with the qdcms-side hooks (configSchemas,
cliCommands, entities, migrations, registerHttpRoutes, install).
Re-export from qdcms-core/module so consumers depend on
qdcms-core, not qdadm directly. Keep qdadm's behavior intact.

**Slice M2 — Plugin interface + Valibot schema**
`qdcms-core/src/plugin/Plugin.ts` (interface) +
`qdcms-core/src/plugin/PluginSchema.ts` (Valibot validator).
No Kernel yet — just the contract.

**Slice M3 — ConfigModule extracted from current loose code**
Wrap the existing `compileConfig`, `validateConcept`,
`builtinSchemas` into a `ConfigModule extends Module`. Public
API of qdcms-core/config stays compatible (re-exports).

**Slice M4 — Kernel with topo + chain**
`qdcms-core/src/kernel/Kernel.ts` : registerModule,
registerPlugin, get, slot, replaced, boot. Topo sort on
requires. Chain-of-replacers ordered by weight, with the
`ctx.replaced(slot)` helper. Same-weight conflict detection.
~500 lines + tests.

**Slice M5 — Plugin loader**
Generalize the current qdcms-cli plugin discovery to load full
plugin instances (not just CLI commands). Validate with
PluginSchema. Wire into the Kernel.boot.

**Slice M6 — Migrate ConfigModule to use Kernel**
The CLI's `qdcms config:compile` invokes
`Kernel.boot({ phase: 'compile' })` internally. The Kernel
walks every module's `configSchemas` and runs the compiler.

**Slice M7 — DCModule as the first kernel-driven module**
Build `DCModule extends Module` inside qdcms-core (Axis 2 of the
roadmap) and let the Kernel orchestrate its install / connect.
DC stays at citizenship='module' — it's a first-class qdcms
concept, not a swappable plugin. Validates the kernel-driven
lifecycle end-to-end with a real consumer.

After M7, the Module/Plugin system is real and the framework
has a clear extension contract. The first **published Plugin**
(citizenship='plugin') ships when an instance asks for a
swappable role — likely auth alternatives or search backends.

---

## 11. References

- [`structure.md`](./structure.md) §6, §7 — instance/core layout,
  where modules and plugins live on disk.
- [`config.md`](./config.md) — config-as-code contract (modules
  contribute schemas, plugins ship install templates).
- [`cli.md`](./cli.md) — qdcms CLI design, oclif plugin
  extensibility (foundation for plugin command discovery).
- [`roadmap.md`](./roadmap.md) — Axis 2 (DC, citizenship 'module'),
  Axis 0bis (Auth, plugin-friendly slot), Axis 6 (Menus) — the
  first concrete consumers of this contract.
- qdadm's `Module` class — `qdadm/packages/qdadm/src/kernel/Module.ts`,
  the base we extend.
