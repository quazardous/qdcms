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
├── docker-compose.yml       ← qdcms + traefik services
├── Dockerfile               ← Node 22 + tooling
├── traefik/
│   ├── traefik.yaml         ← Traefik static config
│   └── dynamic.yaml         ← Traefik dynamic config
└── demo/
    ├── data/                ← sandbox-isolated SQLite (gitignored)
    └── .compiled/           ← sandbox-isolated compiled config
```

## Multi-domain routing (Traefik)

A bundled Traefik routes the sandbox over named subdomains so
tests that care about cookie domains, auth redirect URLs, or
multi-tenant scenarios get a realistic environment :

| URL                                     | Routes to                |
|---|---|
| `http://demo-frontend.qdcms.localhost`  | qdcms:5180 (Vite dev)    |
| `http://demo-backend.qdcms.localhost`   | qdcms:5181 (Express API) |
| `http://traefik.qdcms.localhost`        | Traefik dashboard        |

`*.localhost` auto-resolves to 127.0.0.1 in modern browsers
(Chrome, Firefox, Safari) — no `/etc/hosts` edit needed. For
curl, use `--resolve demo-frontend.qdcms.localhost:80:127.0.0.1`
or a host alias.

Direct ports (5180, 5181) are still mapped — useful for CI or
when Traefik isn't part of the test.

`make urls` prints the catalogue. TLS is off by default ; the
traefik static config has the websecure entrypoint commented out
behind a TODO. Add it (and certs) when a test specifically
needs HTTPS.

## Volume layout — code shared, state isolated

Inside the container :

| Container path | Mounted from           | Purpose                                |
|---|---|---|
| `/core`        | `../core`              | The framework code (= QDCMS_CORE)      |
| `/demo`        | `../demo`              | The instance (the other world)         |
| `/qdadm`       | `../../qdadm`          | Sibling repo, target of file: deps     |
| `/demo/data`   | `./demo/data`          | **Sandbox-isolated** SQLite + journals |
| `/demo/.compiled` | `./demo/.compiled`  | **Sandbox-isolated** compiled artefacts |
| `node_modules` | named volumes          | Per-arch isolation (better-sqlite3)    |

Code edits flow back to the host (mounted read/write). State —
SQLite files, compiled artefacts — stays inside the sandbox so a
`make install` doesn't trample the host's local state.

The two-worlds split (instance vs core) is materialised on disk :
`./core/` is the qdcms repo, `./demo/` is the instance, they are
siblings. The container mounts them at separate paths with no
overlap.

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
