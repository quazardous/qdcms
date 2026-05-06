# `qdcms` CLI — design

> Status : design doc. Implementation lives in
> `packages/qdcms-cli/` (to be scaffolded — slice CLI-1).
> The sandbox (Axis 9) is the first consumer.

The qdcms CLI is the operator's primary surface for everything
NOT runtime — config compile, install, migrate, sandbox, doctor,
plugin lifecycle, admin export/import. Drush is the reference :
one tool, dense in capability, plugin-extensible.

This doc captures the framework choice, the command surface,
and the extensibility contract.

---

## 1. Framework choice : oclif

Three serious candidates for a drush-class CLI :

| Framework  | Plugin system           | Maturity  | Bundle weight | Typing     |
|---|---|---|---|---|
| **oclif**  | First-class, npm-based  | Mature    | Heavier       | Excellent  |
| **citty**  | Manual                  | Young     | Light         | Excellent  |
| **commander** | Manual               | Mature    | Light         | OK         |

**Decision : oclif.**

Why :

- **Native plugin system.** A `qdcms-plugin-dc` package can ship
  CLI commands (`qdcms dc:type:create`, `qdcms dc:list`) by
  declaring `oclif.plugins` in its `package.json`. The user
  installs the plugin, the commands appear. No glue code in the
  instance. This is the killer feature for a drush-class CLI ;
  citty/commander would require us to reinvent it.
- **Topic / command structure.** `qdcms config:compile`,
  `qdcms install`, `qdcms cache:clear` map to oclif's
  topic:command convention out of the box.
- **Auto-generated help, JSON output flag, hooks** (pre/post
  command, init, prerun) — all built in.
- **Mature ecosystem.** Used by Heroku CLI, Salesforce CLI,
  Twilio CLI. Battle-tested for plugin-rich tools.

Trade-off accepted : a few hundred KB of CLI runtime overhead.
Acceptable since the CLI is dev-time / admin-time only — it
never ships in the SPA bundle or the production server.

---

## 2. Package layout

```
packages/qdcms-cli/
├── package.json            ← bin: { qdcms: ./bin/qdcms.js }
├── bin/
│   └── qdcms.js            ← oclif loader (compiled)
├── src/
│   ├── index.ts            ← entry / oclif config
│   ├── commands/
│   │   ├── config/
│   │   │   ├── compile.ts        ← qdcms config:compile
│   │   │   ├── status.ts         ← qdcms config:status
│   │   │   ├── export.ts         ← qdcms config:export
│   │   │   ├── import.ts         ← qdcms config:import
│   │   │   └── doctor.ts         ← qdcms config:doctor
│   │   ├── install.ts            ← qdcms install
│   │   ├── migrate.ts            ← qdcms migrate
│   │   ├── plugin/
│   │   │   ├── enable.ts         ← qdcms plugin:enable
│   │   │   ├── disable.ts        ← qdcms plugin:disable
│   │   │   └── list.ts           ← qdcms plugin:list
│   │   ├── sandbox/
│   │   │   ├── start.ts          ← qdcms sandbox:start
│   │   │   └── stop.ts           ← qdcms sandbox:stop
│   │   └── version.ts            ← qdcms version
│   └── shared/                   ← helpers re-used by commands
│       ├── locate.ts             ← findInstanceDir, findQdcmsCore
│       └── reporter.ts           ← stage-timed output formatter
└── tsconfig.json
```

---

## 3. Command surface (initial)

Drush-aligned naming where the parallel is direct, qdcms-native
where it isn't.

### 3.1 Config

| Command                  | What it does                                                |
|---|---|
| `qdcms config:compile`   | Walks instance config, validates against schemas, emits `.compiled/`. |
| `qdcms config:status`    | Prints which concepts have live (DB) state diverging from instance YAML. |
| `qdcms config:export`    | Dumps DB live state back to instance YAML files.            |
| `qdcms config:import`    | Applies committed instance YAML to the DB (staging-to-prod). |
| `qdcms config:doctor`    | Same as compile but exits non-zero on any deprecation warning (CI gate). |
| `qdcms config:upgrade`   | Interactive — applies schema-suggested replacements (rename fields, move concepts). |

### 3.2 Plugin lifecycle

| Command                         | What it does                                          |
|---|---|
| `qdcms plugin:enable <id>`      | Adds plugin to `qdcms.plugins.yaml`, copies its `config/install/*.yaml` into the instance. |
| `qdcms plugin:disable <id>`     | Removes plugin ; prompts about its `<prefix>.*.yaml` files (rename to `.disabled` / delete / leave). |
| `qdcms plugin:list`             | Lists discovered plugins, their version, enabled status, schema concepts. |

### 3.3 Install / migrate

| Command                  | What it does                                                |
|---|---|
| `qdcms install`          | Full pipeline : config compile, validate, run pending migrations, seed data, smoke checks. |
| `qdcms migrate`          | Just the migration runner (compile assumed up-to-date).     |
| `qdcms migrate:status`   | Prints pending / applied migrations per plugin.             |

### 3.4 Sandbox

| Command                  | What it does                                                |
|---|---|
| `qdcms sandbox:start`    | Spins up the sandbox container (calls `make -C sandbox up`). |
| `qdcms sandbox:stop`     | Tears down. Same as `make -C sandbox down`.                 |
| `qdcms sandbox:exec`     | Runs an arbitrary command inside the sandbox container.     |

The CLI delegates to the Makefile + docker-compose at
`<repo>/sandbox/` ; it doesn't reimplement docker orchestration.

### 3.5 Misc

| Command                  | What it does                                                |
|---|---|
| `qdcms init <template>`  | Scaffolds a fresh instance from a template (`flowercraft`, `minimal`). |
| `qdcms version`          | Prints the CLI version and the discovered qdcms-core version. |
| `qdcms doctor`           | Cross-cutting checks : config compile + plugin discovery + DB connectivity. |

---

## 4. Plugin extensibility

Drush's plugin system : a Drupal module can ship `*.drush.inc`
files and the `drush` binary picks them up. qdcms's parallel :
oclif plugins.

A qdcms plugin package can declare CLI commands in its
`package.json` :

```json
{
  "name": "@quazardous/qdcms-plugin-dc",
  "qdcms-plugin": {},
  "oclif": {
    "bin": "qdcms",
    "topicSeparator": ":",
    "commands": "./dist/cli/commands"
  },
  "exports": {
    ".": "./dist/index.js",
    "./cli/commands": "./dist/cli/commands/index.js"
  }
}
```

The qdcms-cli package, on startup, walks
`<QDCMS_CORE>/node_modules/` for packages keyworded
`qdcms-plugin` and registers their commands. The plugin's
`commands/` dir contributes `qdcms dc:type:create`,
`qdcms dc:type:list`, etc.

---

## 5. UX conventions

- **Topic separator** : `:` (oclif default, also drush). So
  `qdcms config:compile` not `qdcms config compile` and not
  `qdcms-config-compile`.
- **`--help`** on every command, auto-generated.
- **`--json`** flag on every command that prints data — the
  CLI is scriptable.
- **`--dry-run`** on every command that mutates state — see
  what would happen without doing it.
- **Stage-timed output** : every long-running command prints
  per-stage timing (`[12ms] discovered 4 plugins`,
  `[180ms] schema validation`, `[OK in 230ms]`).
- **Exit codes** : 0 on success, 1 on user error (bad input,
  missing config), 2 on system error (unreachable DB), 64+ on
  a failed validation gate (so CI can distinguish).
- **Color** : on by default in TTYs, off when piped or
  `NO_COLOR=1` is set.

---

## 6. Slicing

Implementation order, each commitable :

**CLI-1** — Scaffold `packages/qdcms-cli/` with oclif. Single
command : `qdcms config:compile` (wraps the existing
`compileConfig` from qdcms-core). `bin/qdcms` runs via tsx in
dev, compiled JS in published builds. Replaces the
`demo/scripts/compile-config.ts` shim — the demo's npm scripts
call `qdcms config:compile demo/config` instead.

**CLI-2** — `qdcms config:doctor` + JSON output flag. Wired to
the warnings array from the compile result. CI gate friendly.

**CLI-3** — `qdcms install` (the meaty one) — full pipeline :
ensure config dir exists, compile, validate, run migrations,
report. The sandbox (Axis 9) becomes a docker wrapper around
this command.

**CLI-4** — `qdcms plugin:enable` / `:disable` / `:list`.

**CLI-5** — Plugin discovery for command extensibility (oclif
plugins). DC plugin contributes `qdcms dc:*` commands as the
first proof.

**CLI-6** — `qdcms sandbox:start` / `:stop` / `:exec`,
delegating to `make -C sandbox`.

**CLI-7** — `qdcms config:export` / `:import` / `:status`.

**CLI-8** — `qdcms init <template>`, scaffolds a fresh
instance.

---

## 7. Open questions

- **Bundle vs source distribution** : ship CLI as compiled
  CJS+ESM in the npm package, or rely on tsx at runtime ? The
  npm-published variant must be CJS+ESM compiled (no Node
  runtime ts loader assumption). For workspace-internal use the
  tsx path is fine. Build step needed before publish.
- **Command auto-discovery from plugins** : oclif plugins must
  be declared in the consumer's `package.json` `oclif.plugins`
  array. The qdcms-cli could do this dynamically by walking
  qdcms-keyword'd packages — works, but means every plugin
  install changes the CLI's command set without a
  package.json edit. Decide whether that auto-magic is welcome
  (yes — drush works that way) or surprising (no — explicit is
  better).
- **CLI alias** : `qdcms` everywhere, or also a short `qd` ?
  Drush has `drush` only. Sticking with `qdcms` (no shortcut).

---

## 8. References

- [oclif documentation](https://oclif.io)
- Drush command reference — the gold standard for CMS-class
  CLIs.
- [`config.md`](./config.md) — the contract this CLI executes.
- [`roadmap.md`](./roadmap.md) Axis 9 — the sandbox that's the
  first non-trivial consumer of this CLI.
