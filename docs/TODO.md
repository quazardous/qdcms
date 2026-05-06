# TODO

Loose backlog of "small but worth not forgetting" items. Bigger
arcs live in [`roadmap.md`](./roadmap.md) ; structural intent in
[`structure.md`](./structure.md). This file is for orphan ideas
that don't yet warrant an axis.

Format : one bullet per item, link to the relevant file(s) when
useful, one line of *why* so the entry stays interpretable when
re-read months later.

---

## Bugs

- **Admin zone (`/admin`) crashes in production build.** Spotted
  on `https://demo.nginx.qdcms.localhost:8443/admin` (sandbox
  nginx topology, vite-built dist). The console shows four
  `TypeError: Cannot read properties of undefined (reading
  'meta'/'path'/'fullPath')` — a computed/watcher reads
  `currentRoute.value.X` before the route resolves. The front
  zone (`/en`, `/fr` etc.) renders clean ; the issue is
  qdadm-specific, prod-only (dev mode masks it via Vite's lazier
  evaluation).
  Likely culprit : a qdadm setup function or pinia store reads
  `useRoute()` synchronously in a context where the router
  isn't yet provided. `bootstrap.ts` already runs
  `installQdadm(app)` before `app.use(router)` (smell #3 fix),
  but minified prod evaluation may surface a different timing
  edge. Investigate with sourcemaps : build the SPA with
  `vite build --sourcemap`, reproduce in the sandbox, decode
  the stack to find the offending file:line. Likely fix is
  either deferring the read with a watch or hardening qdadm
  against undefined currentRoute.

## Sandbox

- **Topology profiles in the sandbox.** Add docker-compose
  profiles (or sibling compose files) that exercise each
  production topology documented in [`deploy.md`](./deploy.md).
  Each profile mirrors a real-host setup so deploy regressions
  surface in CI, not in production. Concrete list :
  - `profile-nginx` : nginx vhost in front of qdcms backend +
    SPA dist. Validates the §4 deploy snippet end-to-end.
  - `profile-apache` : same for the apache snippet (§5).
  - `profile-mariadb` : demo against MariaDB instead of SQLite.
  - `profile-postgres` : demo against Postgres.
  - `profile-tls` : nginx + mkcert (or self-signed) for HTTPS.
  - `profile-multi-site` : two instances + two vhosts on one
    core (deploy.md §10).
  Each profile lands as its own slice ; the Makefile gains
  `make profile-<name>` targets that wrap docker compose's
  `--profile` flag. CI gates the merge on a successful
  `profile-nginx` run.

- **CI workflow gating on `make doctor` + `profile-nginx`.**
  GitHub Actions / equivalent. Steps : build the sandbox image,
  run `make doctor`, run `make profile-nginx`, smoke-test via
  curl through the nginx vhost. Sub-100 second budget targeted.

## Frontend

- **`demo/index.html` should be a backend-served template.** The
  current file hard-codes `<title>Flower Craft — fleuriste éco-
  responsable</title>` and the meta description. Both should be
  driven by the instance's branding/SEO config (eventually a row
  in `qdcms_site` or equivalent) so :
  - the title is **dynamic** (per-page override + site-wide
    default),
  - the language attribute (`<html lang="fr">`) follows the
    active locale,
  - meta tags (`description`, `og:*`, `twitter:*`) are composed
    from the same source of truth as the SPA.
  Today index.html is a Vite static asset. Target : either a
  thin shell whose `<title>` / `<meta>` are populated at build
  time from compiled config (config-as-code, see structure.md
  §6.3), or — for the classic backend mode — served by the Node
  server with templating (Express + a tiny templating engine).
  The SPA still owns per-route title updates via vue-router meta
  + `useHead()` once mounted, but the **first paint** title (what
  search engines and link previews see) needs server-side
  composition.
