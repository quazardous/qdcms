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
- **Topology rehearsal** : the same install pipeline that runs
  on a real host (nginx + systemd + …, see [`docs/deploy.md`](../docs/deploy.md))
  can run here under different profiles (nginx, apache, mariadb,
  postgres, tls, multi-site). Catch deploy regressions before
  they hit production.
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
├── docker-compose.env-dist  ← committed env template (ports)
├── docker-compose.env       ← LOCAL env (gitignored, auto-copied from -dist)
├── Dockerfile               ← Node 22 + tooling
├── traefik/
│   ├── traefik.yaml         ← Traefik static config
│   └── dynamic.yaml         ← Traefik dynamic config
└── demo/
    ├── data/                ← sandbox-isolated SQLite (gitignored)
    └── .compiled/           ← sandbox-isolated compiled config
```

## Per-machine ports (`docker-compose.env`)

The Makefile loads `docker-compose.env` to know which host ports
to bind. On first invocation any target auto-copies
`docker-compose.env-dist` to `docker-compose.env` (gitignored).
Edit your local file when defaults clash :

| Var                      | Default | Maps to                           |
|---|---|---|
| `SANDBOX_HTTP_PORT`      | 80      | Traefik HTTP entrypoint            |
| `SANDBOX_FRONTEND_PORT`  | 5180    | Direct port to qdcms's Vite dev    |
| `SANDBOX_BACKEND_PORT`   | 5181    | Direct port to qdcms's Express     |

## Multi-domain routing (Traefik) + HTTPS

A bundled Traefik routes the sandbox over named subdomains so
tests that care about cookie domains, auth redirect URLs, or
multi-tenant scenarios get a realistic environment. Both HTTP
(`:80`) and HTTPS (`:443`) entrypoints are wired :

| URL (HTTP/HTTPS)                          | Routes to                  |
|---|---|
| `(s)://demo-frontend.qdcms.localhost`     | qdcms:5180 (Vite dev)      |
| `(s)://demo-backend.qdcms.localhost`      | qdcms:5181 (Express API)   |
| `(s)://demo.nginx.qdcms.localhost`        | nginx:80 → SPA dist + API  |
| `(s)://traefik.qdcms.localhost`           | Traefik dashboard          |

`make up` prints the catalogue. `make urls` re-prints it.

### Trusted local HTTPS via mkcert

For HTTPS without browser warnings, the sandbox uses [mkcert](https://github.com/FiloSottile/mkcert) :

```sh
# One-time, install mkcert + its local CA :
brew install mkcert        # or apt install mkcert
mkcert -install            # adds the mkcert CA to your browser/system trust store

# Generate the sandbox certs :
make certs                 # writes traefik/certs/dev.{crt,key}
make down && make up       # bounce traefik to load them
```

Without `make certs`, Traefik falls back to its built-in
self-signed cert ; HTTPS still works but the browser warns on
first visit.

The `*.nginx.qdcms.localhost` basename rehearses the production
nginx topology described in [`docs/deploy.md`](../docs/deploy.md)
§4 — single vhost serving the SPA's static `dist/` and reverse-
proxying `/api/qdcms/*` to the backend service. Build the
SPA's dist first :

```sh
make up           # start qdcms + nginx + traefik
make build-spa    # vite build → /demo/frontend/dist
# now http://demo.nginx.qdcms.localhost shows the demo
```

Without the build, nginx returns 404 (no `dist/index.html` to
serve). The direct topology (`*.qdcms.localhost`, no `nginx`
basename) doesn't need the build — Vite serves on the fly.

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
