# qdcms Philosophy

## Core principle: block-centric composition

A page is not an object. A page **emerges** from the blocks whose placement conditions match the current context.

## The container/content split

```
CONTAINER (CDN-cacheable, immutable, tenant-agnostic)
  bundle JS, layouts, registered blocks, theme

   ⇣  fetches at runtime

COMPOSITION (per tenant, per route, cacheable)
  placement rules → which blocks go in which regions

   ⇣  each block fetches its data

DATA (public CDN-cacheable / private no-store)
```

The container is **shared by all tenants** of the deployment. Only the composition and data vary.

## Block-centric, not page-centric

Other CMS frameworks treat pages as the source of truth. qdcms inverts:

- A **block** declares where it should appear (`region`, `when: {...}`).
- A **page** is the runtime resolution of all matching blocks for a given route + context.

This makes site-wide elements (header, nav, footer) trivial: register once, place once with `when: {}`, done.

## Context is the substrate

The runtime context contains everything that influences composition:

```
context = {
  route: '/events',
  params: { ... },
  query: { ... },
  auth: { isAuthenticated: true, roles: [...] },
  tenant: 'foo',
  locale: 'fr',
  ...extensible
}
```

Block placement conditions are pure functions of context. New context dimensions can be added without changing the matcher API.

## PageComposer is replaceable

The default `PageComposer` resolves blocks from the in-memory `PlacementRegistry`. But composition can come from anywhere:

- a remote API (`ApiPageComposer`)
- a JSON file (`StaticPageComposer`)
- a hybrid (`OverlayPageComposer` — base from registry, overrides from API)

Replace the composer, the rest of the framework doesn't change.

## Dev-friendly first

qdcms is **framework-first**, not editor-first. Authors compose pages by writing code, not by clicking. A WYSIWYG editor can be added on top later — but the framework's job is to make code-defined composition pleasant.

## Pairs with qdadm

qdadm provides the back-office; qdcms provides the public side. They share the same EntityManager-driven philosophy:

- qdadm builders → admin pages from entities
- qdcms blocks → public regions from blocks fed by entities

A block can read entity data via qdadm's `EntityManager` — same source of truth.

## Anti-patterns

- **CSS in pages** — pages should be pure composition; styling lives in themes and blocks
- **Per-tenant bundles** — the container ships once, varies by composition only
- **Mixing private data into the descriptor** — descriptors are CDN-cacheable; PII never goes there
- **Global hooks for placement** — placement is declarative, not imperative
