# Configuration architecture

> Status : design doc, partly implemented (TS shape lives at
> `demo/config/` ; YAML format and compile pipeline are TODO).
> Last reviewed 2026-05-06.

This document is the source-of-truth for everything config in
qdcms : where files live, how plugins contribute schemas, how
validation runs, how compilation caches the work. Pair it with
[`structure.md`](./structure.md) (§6.6 in particular) for the
spatial / two-worlds context, and [`roadmap.md`](./roadmap.md)
Axis 2 / Axis 3 for the consumers.

---

## 1. The 2-world model, applied to config

```
┌──────────────────┐         ┌──────────────────────┐
│   instance/      │  ──→    │   QDCMS_CORE         │
│   ─────────      │         │   ───────────        │
│   config/        │         │   packages/          │
│   (.yaml files)  │         │   ├── plugin-X/      │
│                  │         │   │   └── config/    │
│                  │         │   │       ├── install/   ← plugin's defaults
│                  │         │   │       └── schemas/   ← plugin's validators
└──────────────────┘         └──────────────────────┘
```

Two rules :

1. **The instance OWNS its config.** `<instance>/config/*.yaml`
   is the source of truth ; the runtime never reads from a plugin
   package at boot time. Config lives in the site (committed,
   exportable), not scattered across plugin packages.
2. **Plugins CONTRIBUTE.** Each plugin ships its own defaults and
   schemas under `<plugin>/config/`. These are read by the
   compile pipeline at build time, never by the runtime.

This split lets you upgrade a plugin (`npm update @quazardous/qdcms-plugin-dc`)
without invalidating your instance's config — the plugin's new
defaults are NOT silently merged in. You see them next time you
re-compile, with explicit warnings if anything changed.

---

## 2. Where config lives

### 2.1 Instance side (one umbrella, two worlds)

`config/` and `content/` belong to the instance **umbrella**, not
to one of the two worlds (`frontend/` vs `backend/`). Both worlds
read the same files, otherwise they'd drift :

```
demo/                                  ← instance umbrella
├── config/                            ← TRANSVERSAL
│   ├── qdcms.plugins.yaml             ← framework: which plugins are enabled
│   ├── qdcms.locales.yaml             ← framework: active locales + default
│   ├── qdcms.slug-table.yaml          ← framework: page-types & slug routing (until page-types plugin extracts it)
│   ├── plugin-core.users.yaml         ← qdcms-plugin-core's instance-side config
│   ├── plugin-dc.types.yaml           ← qdcms-plugin-dc, copied on install
│   ├── plugin-menus.tree.yaml         ← qdcms-plugin-menus, idem
│   └── .compiled/                     ← generated, gitignored
│       ├── index.ts
│       ├── qdcms.plugins.ts
│       ├── plugin-dc.types.ts
│       └── ...
├── content/                           ← TRANSVERSAL: actual data rows
│   └── realizations.ts
├── data/                              ← TRANSVERSAL: sqlite file (gitignored)
├── frontend/                          ← SPA-only
└── backend/                           ← Server-only
```

### 2.2 Plugin side (under QDCMS_CORE)

```
packages/qdcms-plugin-dc/
├── package.json                       ← keyword: qdcms-plugin
├── qdcms-plugin.yaml                  ← manifest: id, prefix, version, config-paths
├── config/
│   ├── install/                       ← copied to instance/config/ on first enable
│   │   ├── plugin-dc.types.yaml
│   │   └── plugin-dc.fields.yaml
│   └── schemas/                       ← validators run at compile time
│       ├── plugin-dc.types.ts
│       └── plugin-dc.fields.ts
└── src/                               ← runtime code
```

---

## 3. Naming convention

Every file in `<instance>/config/` belongs to one **namespace** :

- **`qdcms.*.yaml` (or just `qdcms.yaml`)** : framework
  built-in concepts (active locales, enabled plugins,
  slug-table…).
- **`plugin-<short>.*.yaml` (or just `plugin-<short>.yaml`)** :
  config for a specific plugin. The `<short>` is the plugin's
  `prefix:` field from its `qdcms-plugin.yaml` — the same one
  used for table prefixing, already enforced unique.

Anything not starting with `qdcms.` or `plugin-` is rejected by
the compiler — pollution at the instance config root is a smell.

### 3.1 Authoring granularity is the instance's choice

A plugin **may** ship its install template split per concept
(`plugin-dc.types.yaml` + `plugin-dc.fields.yaml`) for clarity.
The instance is **not required** to keep that split. Authors are
free to :

- **Combine** everything into a single file per plugin :
  ```yaml
  # config/plugin-dc.yaml — one file for the whole plugin
  types:
    - id: post
      pluralName: Posts
  fields:
    rich-text: { component: rich-editor }
  ```
- **Split** along the plugin's lines :
  ```
  config/plugin-dc.types.yaml
  config/plugin-dc.fields.yaml
  ```
- **Mix** : keep some concepts inline, some external —
  whatever reads best for this site.

The compile pipeline **normalises** : it globs every file
matching the plugin's namespace, merges them into one canonical
view, and emits compiled artifacts per concept regardless of how
the input was split.

### 3.2 Two file shapes : keyed vs concept-named

The compiler accepts two YAML shapes inside a namespace :

- **Concept-named** : the filename's last segment IS the concept
  name. The YAML body is the concept's value directly.
  ```yaml
  # config/plugin-dc.types.yaml — body is the `types` value
  - id: post
  - id: page
  ```

- **Self-keyed** : the filename ends at the namespace
  (`plugin-dc.yaml`), or carries an arbitrary segment that's
  ignored. The YAML body is `{ <concept>: <value>, … }`.
  ```yaml
  # config/plugin-dc.yaml — body keys ARE the concepts
  types:
    - id: post
    - id: page
  fields:
    rich-text: ...
  ```

If a concept appears in more than one file (e.g. instance has
both `plugin-dc.yaml` with a `types:` key AND
`plugin-dc.types.yaml`), the compiler errors with both
file:line locations — author intent must be unambiguous.

### 3.3 Examples

| Filename                          | Owner                                  |
|---|---|
| `qdcms.plugins.yaml`              | framework — list of enabled plugins    |
| `qdcms.locales.yaml`              | framework — active locales             |
| `qdcms.slug-table.yaml`           | framework — until page-types extracts it |
| `qdcms.yaml`                      | framework — alternative all-in-one form |
| `plugin-core.users.yaml`          | qdcms-plugin-core (prefix `core`)      |
| `plugin-dc.types.yaml`            | qdcms-plugin-dc, just the `types` concept |
| `plugin-dc.fields.yaml`           | qdcms-plugin-dc, just the `fields` concept |
| `plugin-dc.yaml`                  | qdcms-plugin-dc, all concepts inline   |
| `plugin-menus.tree.yaml`          | qdcms-plugin-menus                     |
| `plugin-flowercraft.realizations.yaml` | bespoke plugin                    |

**Why two prefix vocabularies (table vs config file)** :

- Table prefix : short (`dc`), lives in a DB namespace, no
  ambiguity since DB schemas are typed.
- Config-file prefix : `plugin-dc`, lives in a flat directory
  shared with framework files (`qdcms.*`). The `plugin-` literal
  is the disambiguator. Every plugin's config files start with
  `plugin-` ; framework's start with `qdcms.` ; nothing else is
  allowed.

**Conflict handling** : two plugins declaring the same `prefix:`
in `qdcms-plugin.yaml` is already a fatal error (table-prefix
collision). That same check covers config-file collisions
mechanically.

---

## 4. Plugin manifest

Each plugin ships a `qdcms-plugin.yaml` at the package root :

```yaml
# packages/qdcms-plugin-dc/qdcms-plugin.yaml
id: '@quazardous/qdcms-plugin-dc'
prefix: 'dc'
version: '0.1.0'
title: 'Dynamic Content'
description: 'Runtime-defined content types — table per type.'

# Config plumbing (paths relative to the plugin package root) :
config:
  install: ./config/install        # defaults copied to <instance>/config/ on first enable
  schemas: ./config/schemas        # validators referenced at compile time

# Tables this plugin owns (already used by the migration runner) :
tables:
  - dc_type        # registry of types
  # per-type tables are created at runtime by the dc plugin itself
```

Implicit rules from the manifest :

- `config/install/plugin-<prefix>.<concept>.yaml` MUST use the
  declared prefix (`plugin-dc.*` for a plugin with `prefix: dc`).
  Mismatched files are rejected at compile time.
- `config/schemas/plugin-<prefix>.<concept>.ts` MUST exist for
  every default file the plugin ships. A missing schema is a
  fatal error.

---

## 5. Schemas (the validation surface)

Schemas are **TypeScript** modules colocated with the plugin
source. Co-location = the schema and the runtime code that
consumes the config evolve together, no drift.

A plugin declares **one schema per namespace** that lists all
the concepts it owns ; the instance can split or combine YAML
files freely (§3.1) but the schema is always the canonical
shape. The compiler matches each concept (whether it came from a
self-keyed file or a concept-named file) against the relevant
entry in this schema.

```ts
// packages/qdcms-plugin-dc/config/schemas/plugin-dc.ts

import { defineConfigSchema, field } from '@quazardous/qdcms-core/config'

export default defineConfigSchema({
  namespace: 'plugin-dc',
  contributedBy: '@quazardous/qdcms-plugin-dc',

  // One entry per concept this plugin owns. The keys here are
  // the concept names found either in the YAML body (self-keyed
  // form) or as the file's last segment (concept-named form).
  concepts: {
    types: {
      identifyBy: 'id',
      shape: {
        type: 'array',
        item: {
          id:         field.string({ locked: true }),
          pluralName: field.string({ overridable: true, default: '' }),
          urlPattern: field.string({ overridable: true, optional: true }),
          fields:     field.array(/* recursive */, { overridable: true, default: [] }),
        },
      },
    },
    fields: {
      identifyBy: 'id',
      shape: {
        type: 'object',
        // …
      },
    },
  },
})
```

`field.string`, `field.array`, etc. are thin wrappers over
[Valibot](https://valibot.dev) — small (~3 KB gzipped),
tree-shakeable, types-first. The wrapper adds qdcms-specific
annotations (`locked`, `overridable`, `optional`, `default`).

### 5.1 Field annotations

- **`locked: true`** — plugin's default value is final ; the
  instance MUST NOT change it. Used for identity fields (ids,
  prefixes, version markers).
- **`overridable: true`** (default) — instance can replace.
- **`optional: true`** — field may be absent. Pair with
  `default:` to give it a fallback ; without one, the field is
  truly optional (compiled value is `undefined`).
- **`default: <value>`** — fallback when the field is absent
  from the instance YAML. The compile pipeline materialises this
  into the typed `.compiled/` artefact (no runtime fallback
  needed). See §5.2.
- **`deprecated: { since, replacement?, removeIn?, message? }`** —
  field is still accepted but the compiler emits a warning when
  it appears in instance YAML. See §5.4.

### 5.2 Partial instance configs inherit schema defaults

Instance YAML files MAY be partial — missing fields fall back to
the schema's declared `default:`. Authors can deliberately delete
a field they want "back to default" without retyping the value.

```ts
// schemas/plugin-dc.types.ts (excerpt)
field.string({ default: '' })          // missing → ''
field.boolean({ default: false })      // missing → false
field.string({ optional: true })       // missing → undefined (typed as `string | undefined`)
field.string({ required: true })       // missing → fatal compile error
```

The merge order is **schema → instance**, layer by field :

1. Start from schema defaults for the entry type.
2. Apply the instance entry's fields on top.
3. Validate the result against the schema's typing + locked rules.
4. Emit the final merged values into `.compiled/`.

The plugin's `config/install/*.yaml` is **NOT** a runtime layer.
It's the "template" copied to the instance on first enable
(see §7) — once copied, the instance owns the file, and
upgrading the plugin doesn't silently merge new defaults.
`qdcms config:diff --plugin dc` shows what's drifted in the
plugin's install template since you copied it ; you opt in
manually.

This means the compile pipeline only ever reads two layers per
concept : the schema (for defaults + types) and the instance
YAML (for values). The plugin install template is reference data
inspected by `:diff` and `:status` commands, not by `:compile`.

### 5.3 Deprecation lifecycle

Plugins evolve : a field gets renamed, a concept is split, a
whole namespace gets sunset when a feature ships in another
plugin. The schema flags the transition so authors hear about
it at compile time, not at runtime when something breaks.

**Three levels of deprecation** :

1. **Field-level** — a single field within a concept is going
   away :
   ```ts
   field.string({
     deprecated: {
       since: '0.4.0',
       replacement: 'pluralName',
       removeIn: '0.6.0',
       message: 'Use `pluralName` instead — it now drives the admin label too.',
     },
   })
   ```

2. **Concept-level** — the whole concept (e.g. `plugin-dc.foo`)
   is being moved or removed :
   ```ts
   concepts: {
     foo: {
       deprecated: { since: '0.4.0', replacement: 'plugin-dc.bar', removeIn: '0.6.0' },
       shape: { /* still validated for now */ },
     },
   }
   ```

3. **Namespace-level** — the whole plugin's config is being
   sunset (e.g. plugin merged into another, or replaced) :
   ```ts
   defineConfigSchema({
     namespace: 'plugin-old',
     deprecated: { since: '0.4.0', replacement: 'plugin-new', removeIn: '1.0.0' },
     concepts: { /* … */ },
   })
   ```

**Compile-time output** — deprecation is a **warning**, never a
hard error (unless `removeIn` is reached and the schema is
upgraded to remove the field) :

```
[qdcms config:compile] WARN deprecated field
  config/plugin-dc.types.yaml line 8: field 'subtitle' on type 'post' is deprecated since 0.4.0
    suggested replacement: pluralName
    will be removed in:    0.6.0
    schema:                packages/qdcms-plugin-dc/config/schemas/plugin-dc.ts
    message:               Use `pluralName` instead — it now drives the admin label too.
```

The summary line at the end of a compile reports counts :

```
[qdcms config:compile] OK in 47ms — 8 concepts, 3 changed, 2 deprecation warnings
```

**Author tools** :

- `qdcms config:doctor` — same checks as compile but exits non-zero
  when ANY deprecation warning is unaddressed (good for CI gates).
- `qdcms config:upgrade` — interactive : reads the schema's
  `replacement` hints and offers to rewrite the instance YAML
  (rename fields, move concepts to their new namespace).

**Once `removeIn` ships** : the next plugin version drops the
deprecated entry from the schema. Existing instance YAML using
the old key now fails compile with a "unknown field" error
pointing at the schema. Authors who ran `:upgrade` are unaffected ;
authors who ignored the warnings are forced to deal with it before
they can build.

### 5.4 Locked-field violation example

The compile pipeline runs the locked check by comparing the
schema-declared identity against the instance's current value
for every entry identified by `identifyBy`. A mismatch on a
locked field is a fatal compile error pointing at the offending
file:line :

```
[qdcms config:compile] locked-field violation
  config/plugin-dc.types.yaml line 12: type 'realization' overrides locked field 'id'
    schema declared by:  packages/qdcms-plugin-dc/config/schemas/plugin-dc.types.ts
    locked fields:       id
```

### 5.5 Schema discovery at compile time

The compile CLI walks `<QDCMS_CORE>/node_modules/` for packages
keyworded `qdcms-plugin`. For each, it reads `qdcms-plugin.yaml`,
follows `config.schemas`, and dynamically imports each `.ts` file.
This happens once per build (and on YAML save in dev watch mode).

---

## 6. The compile pipeline

Authoritative goal : **the runtime never parses YAML, never runs
validators**. Both ship in dev / build dependencies only.

### 6.1 Stages

```
   discover plugins                 (walk node_modules for qdcms-plugin keyword)
        │
        ▼
   load schemas                     (TS dynamic import per plugin)
        │
        ▼
   read instance YAML               (fs.readFile per <prefix>.<concept>.yaml)
        │
        ▼
   merge schema defaults            (per-entry, fill missing fields from schema)
        │
        ▼
   validate against schemas         (Valibot types, locked-field check)
        │     ↓ fail-loud with file:line
        ▼
   emit .compiled/                  (typed TS modules — final merged values)
```

The output is plain TS modules under `<instance>/config/.compiled/`,
one per file (so `plugin-dc.types.yaml` →
`.compiled/plugin-dc.types.ts`). Plus an aggregator
`.compiled/index.ts` re-exporting everything :

```ts
// .compiled/index.ts (generated)
export { plugins } from './qdcms.plugins'
export { locales } from './qdcms.locales'
export { dcTypes } from './plugin-dc.types'
// ...

import { plugins } from './qdcms.plugins'
import { locales } from './qdcms.locales'
// ...
const config = { plugins, locales, dcTypes /* ... */ }
export default config
```

Tree-shakeable on the SPA side : a route handler that only needs
`plugin-menus.tree` doesn't drag `plugin-dc.types` into the
bundle.

### 6.2 Caching — make it FAST

Naive recompile reads every YAML, runs every validator, rewrites
every `.ts` on every dev save. That's seconds of overhead in a
50-plugin instance. **Two-level cache** to skip what hasn't
changed.

#### 6.2.1 Timestamp pre-check (the fast path)

Before doing anything, the CLI computes :

- `latestInputMtime` : max mtime across *all* discovered inputs —
  every `<instance>/config/*.yaml` AND every plugin schema file
  imported in this compilation.
- `cacheStampMtime` : mtime of `.compiled/.cache.json`.

If `latestInputMtime <= cacheStampMtime`, the compile is a
**no-op** : the cache stamp guarantees no input has been touched
since the last successful compile. Wall-clock cost : a handful of
`fs.stat` calls. Sub-millisecond on warm FS cache.

#### 6.2.2 Hash-based per-file cache (the correct path)

When the timestamp check fails (or the cache is missing), the
CLI hashes each input :

- For each YAML file : `sha256(content)`.
- For each schema TS file : `sha256(content)`.
- Aggregate per concept : `sha256(yaml-hash || schema-hash)`.

The aggregate hash per concept is stored in
`.compiled/.cache.json` :

```json
{
  "version": 1,
  "compiledAt": "2026-05-06T08:30:21Z",
  "concepts": {
    "qdcms.plugins":  { "hash": "abc...", "out": "qdcms.plugins.ts" },
    "qdcms.locales":  { "hash": "def...", "out": "qdcms.locales.ts" },
    "plugin-dc.types": { "hash": "ghi...", "out": "plugin-dc.types.ts" }
  },
  "schemaHashes":  { "@quazardous/qdcms-plugin-dc/plugin-dc.types.ts": "..." }
}
```

For each concept :

- If `hash(yaml + schema) == cache.concepts[concept].hash` →
  skip validation AND emit. The `.compiled/<concept>.ts` from
  the previous run is still valid.
- Otherwise → re-validate, re-emit, update the cache entry.

Touch the cache stamp (`.compiled/.cache.json`) at the end so
the timestamp pre-check succeeds next time.

#### 6.2.3 Cache invalidation triggers

Beyond YAML / schema content :

- **Plugin set changed** : if `qdcms.plugins.yaml` enables a new
  plugin, the cache entry for that plugin's concepts is missing —
  treated as a miss, validation runs.
- **Schema lib version bumped** : the `qdcms-core` package
  version (or the Valibot version, transitively) is part of the
  hash. New compiler version → cache miss → recompile-all.
- **Compiler version itself** : the cache schema version is
  pinned in `.cache.json` (`"version": 1`). If a future compiler
  bumps to v2, all caches read with v != 2 are discarded.

#### 6.2.4 What's NOT cached

- The `.compiled/index.ts` aggregator — it's tiny and depends on
  the full set of concepts. Always rewritten if any concept
  changed.
- The plugin discovery walk — `node_modules/` listing is cheap
  and must catch newly-installed plugins.

### 6.3 Watch mode (dev)

In dev, the compiler runs in watch mode :

- Watches `<instance>/config/*.yaml` and every imported schema
  file.
- On change, runs the per-file hash check, recompiles only the
  affected concepts, updates cache.
- The Vite plugin (which wraps the CLI) emits an HMR event on
  the touched `.compiled/<concept>.ts` so Vite re-runs the
  modules importing it without a full reload.

Wired in `package.json` :

```json
{
  "scripts": {
    "dev": "qdcms config:compile --watch & vite",
    "build": "qdcms config:compile && vite build"
  }
}
```

(Or as a Vite plugin that owns the lifecycle — same outcome,
fewer scripts.)

### 6.4 What `qdcms config:compile` outputs to the human

```
[qdcms config:compile] discovered 4 plugins (qdcms-plugin-core, qdcms-plugin-dc, qdcms-plugin-menus, qdcms-plugin-flowercraft)
[qdcms config:compile] 8 concepts, 3 changed since last compile
[qdcms config:compile] OK in 47ms (skipped 5 from cache)
```

Failures point at the offending file:line and the plugin that
declared the schema.

---

## 7. The first-install flow

When `qdcms.plugins.yaml` enables a new plugin, the CLI :

1. Reads the plugin's `config/install/*.yaml` files.
2. For each, checks if `<instance>/config/<prefix>.<concept>.yaml`
   exists.
   - **Doesn't exist** : copy the plugin's default verbatim.
     Includes a leading comment :
     ```yaml
     # Copied from @quazardous/qdcms-plugin-dc@0.1.0 on 2026-05-06.
     # Edit freely ; future plugin upgrades won't overwrite this file
     # (qdcms config:diff --plugin dc shows what changed in the plugin).
     ```
   - **Exists** : leave alone. Run `qdcms config:diff` if you
     want to inspect the plugin's new default vs. your current
     state.
3. Updates `qdcms.plugins.yaml` install timestamp + version
   marker.

This is the ONLY moment the plugin's `install/` is read at
runtime-ish (well, install-time). After that, the plugin's
install dir is static reference data only — read by the diff
command on demand, never auto-merged.

---

## 8. Live config (admin write-back)

The admin UI (qdadm modules, see roadmap Axis 3) edits config
through standard CRUD on tables. The compiled YAML is the
**static** state ; the DB carries the **live** state.

Two flows :

### 8.1 Read at boot

1. Boot loads `<instance>/config/.compiled/index.ts` (the static
   state).
2. Boot loads `qdcms_config_live` rows from the DB (overrides
   coming from admin edits since last export).
3. Runtime config = static + live (replace at concept level).

### 8.2 Export on demand

`qdcms config:export` dumps the current DB live state back into
`<instance>/config/<prefix>.<concept>.yaml`, replacing the
human-readable file. Author commits the diff.

`qdcms config:status` prints which concepts have live rows
diverging from the YAML — useful before exporting.

`qdcms config:import` does the reverse : applies committed YAML
to the DB. Useful for staging-to-prod deploys.

---

## 9. Layered config storage

The config layer separates four concerns deliberately :

| Concern                                | Where it lives                                       |
|---|---|
| Plugin install templates (default rows) | `packages/<plugin>/config/install/*.yaml`           |
| Plugin schemas (validation + types)    | `packages/<plugin>/config/schemas/*.ts`              |
| Instance source of truth (committed)   | `<instance>/config/*.yaml`                          |
| Live admin-edited state                | `qdcms_config_live` rows in the DB                  |
| Compile-time merge of all of the above | `<instance>/config/.compiled/*.ts`                  |

Operator surface (the qdcms CLI, see `cli.md`) :
`qdcms config:compile`, `:export`, `:import`, `:status`,
`:doctor`, `:upgrade`. Plugin lifecycle :
`qdcms plugin:enable`, `:disable`, `:list`.

---

## 10. Where we are vs. target

| Layer                                  | Today                                           | Target                                       |
|---|---|---|
| Instance config location               | `demo/config/` (umbrella) ✅                    | unchanged                                    |
| File format                            | `*.ts` (manual exports)                         | `*.yaml`                                     |
| Naming                                 | flat (`locales.ts`, `plugins.ts`)                | `qdcms.*.yaml` / `plugin-<short>.*.yaml`     |
| Plugin manifest                        | `qdcms-plugin.yaml` (manifest only)             | + `config:` block referencing `install`/`schemas` |
| Plugin defaults                        | not shipped (inline in instance)                | `<plugin>/config/install/*.yaml`             |
| Plugin schemas                         | none                                            | `<plugin>/config/schemas/*.ts` (Valibot)     |
| Validation                             | TypeScript compile only                         | compile-time validator + locked-field check  |
| Compile pipeline                       | none                                            | `qdcms config:compile` CLI + Vite plugin     |
| Caching                                | n/a                                             | `.cache.json` (timestamp + hash)             |
| Live admin write-back                  | none                                            | `qdcms_config_live` table + export/import    |

---

## 11. Migration plan

**Slice C1** ✅ — Per-concept TS files at `demo/frontend/config/`.
Created shape, no compiler.

**Slice C2** ✅ — Move `config/` and `content/` to `demo/`
umbrella (transversal, both worlds).

**Slice C3** — Apply namespaced naming (TS still). Rename
`locales.ts` → `qdcms.locales.ts` etc. Update consumers. Doc-only
shape change. Sets the path for YAML.

**Slice C4** — Build a minimal `qdcms config:compile` CLI in
`packages/qdcms-core/` :
- Reads plugin manifests.
- Globs `<instance>/config/qdcms.*.yaml` and
  `<instance>/config/plugin-*.yaml` (introduces YAML for the
  first time).
- Normalises the dual file shapes (concept-named vs self-keyed,
  §3.2) into a single per-namespace object.
- Emits `.compiled/<namespace>.<concept>.ts` regardless of how
  the input was split.
- No schema validation yet — pure passthrough.
- No cache yet — recompile every time.

**Slice C5** — Add Valibot-based schemas to `qdcms-plugin-core`.
First schema = `qdcms.locales` (a small array). Compiler
validates against it, applies schema defaults for partial inputs,
runs locked-field check. Compile errors point at file:line.

**Slice C6** — Add the cache layer (timestamp pre-check + hash).
Measure compile time before/after on the demo. Target : sub-50ms
incremental compile.

**Slice C7** — Wire watch mode + Vite plugin. `npm run dev`
auto-compiles on save without manual step.

**Slice C8** — Deprecation surface (§5.3) : warning emission,
`qdcms config:doctor`, `qdcms config:upgrade`. CI can gate on
zero warnings.

**Slice C9** — `qdcms config:export` / `:import` / `:status`.
Pre-req for admin-driven config (Axis 3).

**Slice C10** — DC plugin scaffolds the first non-core schema +
install defaults. Validates the contract end-to-end.

After C10 : the demo's `plugin-dc.types.yaml` (or
`plugin-dc.yaml`, the instance chose) is the source of truth ;
the classic and browser backends both consume the same compiled
artifact ; the admin can edit DC types and `config:export` writes
back to the YAML — Axis 2 unblocked.

---

## 12. Open questions

- **Validator lib** : Valibot proposed ; alternatives are Zod
  (bigger, more popular) and pure JSON-Schema + Ajv (no TS
  inference, but standardized). Decide before C5.
- **Schema format** : `.ts` colocated with plugin source proposed.
  Alternative : `.yaml` schemas (more declarative) with a runtime
  adapter. `.ts` wins on IDE support ; revisit if
  authoring-by-non-devs becomes a goal.
- **Cache invalidation on schema-version bump** : currently
  proposes hashing the schema TS file content. Sufficient unless
  schemas import shared helpers — then a helper change wouldn't
  invalidate downstream caches. Pragma : invalidate on the
  framework's `qdcms-core` package version too.
- **Multi-file concepts** : RESOLVED — §3.1/§3.2 lets the
  instance split a single concept across multiple YAML files
  (concept-named and self-keyed forms), and the compiler
  normalises into one canonical view per concept.
- **Plugin uninstall** : when an admin disables a plugin, what
  happens to its `<prefix>.*.yaml` files in the instance ? Soft
  (rename to `<prefix>.*.yaml.disabled`) ? Hard (delete) ? Ask
  ? Default proposal : ask (CLI prompt) with a `--yes` flag for
  CI.

---

## 13. References

- [`structure.md`](./structure.md) §6.6 — config-as-code in the
  instance layout.
- [`roadmap.md`](./roadmap.md) Axis 0 (i18n), Axis 1 (page types),
  Axis 2 (DC), Axis 3 (admin UI) — all consume this contract.
- [Valibot](https://valibot.dev) — the proposed schema lib.
