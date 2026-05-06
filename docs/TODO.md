# TODO

Loose backlog of "small but worth not forgetting" items. Bigger
arcs live in [`roadmap.md`](./roadmap.md) ; structural intent in
[`structure.md`](./structure.md). This file is for orphan ideas
that don't yet warrant an axis.

Format : one bullet per item, link to the relevant file(s) when
useful, one line of *why* so the entry stays interpretable when
re-read months later.

---

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
