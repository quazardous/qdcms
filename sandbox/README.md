# sandbox/ — qdcms reproducible environment

A Docker-based sandbox that runs qdcms in an isolated,
reproducible environment. Multi-purpose, driven by a Makefile.
Plays the role of "clean room" for install-pipeline testing,
plugin author harnesses, demo runs, and debugging.

## Why

qdcms touches enough moving parts (Node version, npm workspace
linking, SQLite, Vite, MikroORM, qdadm cross-repo file: links)
that "works on my machine" is a real risk. The sandbox is the
canonical answer to "does this work in a clean env?" — useful for :

- **CI** : every PR runs `make -C sandbox install` and `make
  test` before merge. Catches dev-machine drift.
- **Plugin authors** : `make plugin-test PLUGIN=./my-plugin`
  spins up a minimal instance with just qdcms-plugin-core and
  the plugin under test.
- **New users** : `make demo` runs the Flower Craft demo
  inside the sandbox — no local Node setup required, just
  Docker.
- **Reproducible install pipeline** : `make install` exercises
  the full path (config compile, schema validation, DB
  migrations, seed) against a clean state.
- **Debugging** : `make shell` drops into a shell with the repo
  mounted and qdcms tooling on the PATH.

## Quick start

```sh
make help          # list every target with a one-liner
make up            # start the container (background)
make install       # run the full install pipeline against demo/
make demo          # boot the demo (frontend + backend) inside
make shell         # interactive shell, repo mounted at /workspace
make down          # tear down
```

## Layout

```
sandbox/
├── README.md                ← this file
├── Makefile                 ← driver — `make help` is the spec
├── docker-compose.yml       ← single qdcms service (extensible)
├── Dockerfile               ← Node 22 + tooling
└── demo/
    └── data/                ← sandbox-isolated SQLite (gitignored)
```

## Volume layout — code shared, state isolated

Inside the container :

| Container path | Mounted from           | Purpose                                |
|---|---|---|
| `/core`        | `../` (qdcms repo)     | The framework code (= QDCMS_CORE)      |
| `/demo`        | `../demo`              | The instance (the other world)         |
| `/qdadm`       | `../../qdadm`          | Sibling repo, target of file: deps     |
| `/demo/data`   | `./demo/data`          | **Sandbox-isolated** SQLite + journals |
| `/demo/.compiled` | `./demo/.compiled`  | **Sandbox-isolated** compiled artefacts |
| `node_modules` | named volumes          | Per-arch isolation (better-sqlite3)    |

Code edits flow back to the host (mounted read/write). State —
SQLite files, compiled artefacts — stays inside the sandbox so a
`make install` doesn't trample the host's local state.

`/core/demo` exists incidentally inside the container (the host
repo carries `demo/` as a workspace sub-folder for dev
convenience). The CLI and Makefile address the demo via `/demo`
only ; `/core/demo` is a workspace-resolution side effect, not a
deliberate cross-world path. Pulling the demo out of the repo's
workspaces array is on the to-do list.

## Services

`docker-compose.yml` defines a single `qdcms` service today.
Future additions :

- A `db` service (Postgres) for instances that don't use SQLite.
- A `mailcatcher` for transactional emails.
- A `traefik` for multi-domain demos.

Add them as you need them ; the Makefile's targets remain the
stable surface.

## Relationship to the qdcms CLI

Once `packages/qdcms-cli/` exists (see `docs/cli.md`), the
Makefile's targets become thin wrappers over `qdcms` commands :

| Make target          | Eventual CLI                          |
|---|---|
| `make install`       | `qdcms install`                       |
| `make compile-config`| `qdcms config:compile`                |
| `make doctor`        | `qdcms config:doctor`                 |
| `make plugin-list`   | `qdcms plugin:list`                   |

Until the CLI is scaffolded (slice CLI-1+), targets call the
existing `tsx` scripts directly.
