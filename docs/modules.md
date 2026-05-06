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

| Citizenship | Distribution                  | API access      | Contract         |
|---|---|---|---|
| **module**  | Part of qdcms-core (or another framework package) — imported directly | Can use internal qdcms-core APIs | Loose (just `Module` class) |
| **plugin**  | Standalone npm package keyworded `qdcms-plugin` — discovered at boot | Public API only | Strict (`Plugin` interface) |

Both kinds use the same `Module` base class and the same Kernel
lifecycle. The difference is **packaging + isolation discipline**,
not behaviour.

A plugin is the public version of a module — same mechanism,
stricter contract.

### Why distinguish

- **Stability vs evolution** : modules are version-locked to the
  framework ; plugins evolve at their own semver pace.
- **Discovery surface** : the Kernel knows its own modules at
  build time ; plugins are discovered from
  `<QDCMS_CORE>/node_modules/` at boot.
- **Trust boundary** : modules can poke into qdcms-core
  internals ; plugins must stick to the public surface so
  framework refactors don't silently break them.

### Promotion path

A module can be **promoted to a plugin** when external
alternatives become useful : extract its impl into its own npm
package, mark it as `qdcms-plugin`, version it independently. The
Module's class doesn't change ; its packaging does.

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
  readonly id: string                          // '@quazardous/qdcms-plugin-dc'
  readonly version: string                     // semver
  readonly prefix: string                      // 'dc' (table + config-file prefix)

  // Role identity — what this plugin "is" to dependants.
  readonly name: string                        // typically same as prefix or derived from it

  // Topology in the kernel registry.
  readonly requires?: readonly string[]        // names this plugin needs
  readonly replaces?: readonly string[]        // names this plugin overrides

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
// packages/qdcms-plugin-dc/src/DCPlugin.ts
class DCPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-dc'
  readonly name = 'dc'
  readonly prefix = 'dc'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly replaces = []

  readonly configSchemas = [dcTypesSchema, dcFieldsSchema]
  readonly entities = [dcTypeEntity, /* dynamic per-type tables */]
  readonly migrations = [dcInitialMigration]

  async install(ctx) { /* seed default DC types */ }
  async uninstall(ctx) { /* drop dc_* tables */ }

  registerHttpRoutes(router) {
    router.get('/api/qdcms/dc/types', this.listTypes)
    // …
  }
}
```

---

## 4. Override mechanism (`replaces`)

A plugin can take the slot of any other already-registered name
(module OR plugin) by declaring `replaces: ['<name>']`. The
Kernel unregisters the previous occupant and registers the
plugin under that name.

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

After registration, the Kernel's registry has the plugin under
**all** the relevant names :

```
kernel['elastic']  = ElasticSearchPlugin   // its own slot
kernel['search']   = ElasticSearchPlugin   // via replaces
kernel['indexer']  = ElasticSearchPlugin   // via replaces
kernel['fulltext'] = ElasticSearchPlugin   // via replaces
```

Modules that depend on `requires: ['search']` continue to
resolve correctly — they get the plugin instance. The
consolidation is transparent.

### Conflict detection

- Two plugins claiming the same `replaces` slot → fatal at boot
  (`"plugins '@x/foo' and '@y/bar' both replace 'auth'"`).
- A plugin that `replaces: ['inexistent']` → warning, plugin
  runs additively under its own name.
- A plugin's `requires` not satisfied after replace resolution
  → fatal.

### Schema inheritance on replace

Override moves the **runtime slot** but **keeps the replaced
party's `configSchemas`** registered in the compile-time
registry. The rationale : a plugin that replaces `auth` is
declaring "I take over the role" — and that role comes with the
existing config surface (e.g. `auth.cookies-options`,
`auth.session-ttl` files the user has already written and the
admin has filled). The replacing plugin reads them via the
shared config registry.

### Decorator pattern (wrapping the replaced impl)

If a replacing plugin wants to keep the original implementation
alive internally (decorator / MFA-on-top-of-password pattern),
**use npm to do it** — no kernel-level magic. Add the
replaced plugin as a regular npm dependency, import its class,
instantiate it for the wrapper's private use :

```ts
// AuthMFAPlugin's package.json
{
  "name": "@quazardous/qdcms-plugin-auth-mfa",
  "dependencies": {
    "@quazardous/qdcms-plugin-auth-cookies": "^1.0.0"
  }
}
```

```ts
// AuthMFAPlugin source
import { CookiesAuthPlugin } from '@quazardous/qdcms-plugin-auth-cookies'

class AuthMFAPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-auth-mfa'
  readonly name = 'auth-mfa'
  readonly replaces = ['auth'] as const

  private inner = new CookiesAuthPlugin()        // private decorator target

  async install(ctx) {
    await this.inner.install(ctx)                // delegate base setup
    await this.addMfaSecretColumn(ctx)           // add MFA-specific bits
  }

  registerHttpRoutes(router, ctx) {
    router.post('/api/qdcms/auth/login', async (req, res) => {
      const user = await this.inner.verifyCredentials(req.body)
      // …add MFA challenge on top
    })
  }
}
```

The Kernel stays simple — it manages **slots**, not decoration
relationships. Decoration is a plugin-author concern, expressed
through standard npm dependency syntax. The wrapping plugin
takes the slot via `replaces` ; the wrapped impl is invisible
to other dependants but freely usable by the wrapper.

```ts
class OAuthPlugin extends Module implements Plugin {
  readonly replaces = ['auth'] as const
  readonly configSchemas = [oauthSchema]   // adds its own

  async install(ctx) {
    // Read the replaced plugin's config the same way as if it
    // were our own — no special API.
    const cookieOpts = ctx.config.get('auth.cookies-options')
    const ttl        = ctx.config.get('auth.session-ttl')
    const oauthCfg   = ctx.config.get('auth-oauth.providers')

    // …use them.
  }
}
```

The replacing plugin can :

- **Inherit silently** : do nothing, the replaced schemas stay
  registered, instance YAML files still validate, plugin reads
  them as needed.
- **Extend** : declare its own `configSchemas` (additional
  files / concepts the user can author).
- **Drop** : declare `dropsConfigSchemas: ['auth.legacy-thing']`
  to mark a schema as unused. The compile pipeline emits a
  deprecation warning if the user still has YAML for it ; after
  one major bump, the schema is unregistered and the YAML is
  rejected.

```ts
class OAuthPlugin extends Module implements Plugin {
  readonly replaces = ['auth'] as const
  readonly configSchemas = [oauthSchema]
  readonly dropsConfigSchemas = ['auth.password-policy'] as const   // not used by OAuth
}
```

This makes plugin replacement **non-destructive by default** —
the user's existing config keeps working under the new
implementation, with explicit opt-out for the parts the new
impl doesn't honour.

### Module override : allowed but unusual

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
interface Slot {
  readonly name: string
  readonly instance: Module
  readonly citizenship: 'module' | 'plugin'
  readonly origin: string                    // 'qdcms-core' or '@x/qdcms-plugin-Y'
}

class Kernel {
  // Registration (called in order : modules first, then plugins
  // in topo-sorted order).
  registerModule(m: Module): void
  registerPlugin(p: Plugin): void
  unregister(name: string): void

  // Access.
  get(name: string): Slot | undefined
  list(): readonly Slot[]

  // Boot — applies the full pipeline (validate, topo, register).
  boot(input: KernelInput): Promise<void>
}
```

`boot()` runs the orchestration described in §4 :

```
1. Register internal modules (citizenship = 'module')
2. Resolve enabled plugins from qdcms.plugins.yaml + discovery
3. Validate plugin contracts (Valibot)
4. Detect override conflicts (multiple replaces on same slot)
5. Topo-sort plugins by `requires` (post-replace registry)
6. Apply : for each plugin in topo order, unregister(replaces),
   then registerPlugin
7. Run lifecycle hooks (install, connect) per phase
```

Cycles in `requires` → fatal with the cycle path printed.
Unsatisfied `requires` → fatal with the missing slot name.

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

### 6.2 DCPlugin (public — citizenship 'plugin')

```ts
class DCPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-dc'
  readonly name = 'dc'
  readonly prefix = 'dc'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly configSchemas = [dcTypesSchema, dcFieldsSchema]
  readonly entities = [dcTypeEntity]
  readonly migrations = [dcInitialMigration]

  async install(ctx) {
    // Apply migrations + seed default types from
    // <plugin>/config/install/plugin-dc.types.yaml
  }

  registerHttpRoutes(router) {
    router.get('/api/qdcms/entity/dc/:type', this.handler)
    router.post('/api/qdcms/entity/dc/:type', this.handler)
    // …
  }
}
```

Discovered via the qdcms-plugin keyword on the package, validated
at boot. Adds a new role (`dc`) to the kernel — no override.

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

### 6.4 OAuthPlugin (drop-in auth replacement)

```ts
class OAuthPlugin extends Module implements Plugin {
  readonly id = '@quazardous/qdcms-plugin-auth-oauth'
  readonly name = 'auth-oauth'
  readonly prefix = 'auth-oauth'
  readonly version = '0.1.0'

  readonly requires = ['config'] as const
  readonly replaces = ['auth'] as const

  // Same role contract as the default auth module.
  readonly entities = [oauthSessionEntity, oauthProviderEntity]
  readonly migrations = [oauthInitialMigration]

  registerHttpRoutes(router) {
    router.get('/api/qdcms/auth/login/oauth/:provider', this.startHandler)
    router.get('/api/qdcms/auth/callback/oauth/:provider', this.callbackHandler)
  }
}
```

`requires: ['auth']` consumers (DC, admin UI) work transparently
with this plugin in place.

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

A plugin package (e.g. `@quazardous/qdcms-plugin-dc`) lives in
its own git repo + npm package — never inside qdcms-core.
Modules ship inside qdcms-core packages.

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

**Slice M4 — Kernel with topo + override**
`qdcms-core/src/kernel/Kernel.ts` : registerModule,
registerPlugin, unregister, get, boot. Topo sort on requires.
Override-with-replaces. Conflict detection. ~400 lines + tests.

**Slice M5 — Plugin loader**
Generalize the current qdcms-cli plugin discovery to load full
plugin instances (not just CLI commands). Validate with
PluginSchema. Wire into the Kernel.boot.

**Slice M6 — Migrate ConfigModule to use Kernel**
The CLI's `qdcms config:compile` invokes
`Kernel.boot({ phase: 'compile' })` internally. The Kernel
walks every module's `configSchemas` and runs the compiler.

**Slice M7 — DC as the first published Plugin**
Build `@quazardous/qdcms-plugin-dc` (Axis 2) using the full
Plugin contract. Validates the design end-to-end.

After M7, the Module/Plugin system is real and the framework
has a clear extension contract.

---

## 11. References

- [`structure.md`](./structure.md) §6, §7 — instance/core layout,
  where modules and plugins live on disk.
- [`config.md`](./config.md) — config-as-code contract (modules
  contribute schemas, plugins ship install templates).
- [`cli.md`](./cli.md) — qdcms CLI design, oclif plugin
  extensibility (foundation for plugin command discovery).
- [`roadmap.md`](./roadmap.md) — Axis 2 (DC), Axis 0bis (Auth),
  Axis 6 (Menus) — first concrete plugins.
- qdadm's `Module` class — `qdadm/packages/qdadm/src/kernel/Module.ts`,
  the base we extend.
