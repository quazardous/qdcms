# TODO

Loose backlog of "small but worth not forgetting" items. Bigger
arcs live in [`roadmap.md`](./roadmap.md) ; structural intent in
[`structure.md`](./structure.md). This file is for orphan ideas
that don't yet warrant an axis.

Format : one bullet per item, link to the relevant file(s) when
useful, one line of *why* so the entry stays interpretable when
re-read months later.

---

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
