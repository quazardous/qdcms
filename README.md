# qdcms

**The block-centric public framework that pairs with [qdadm](https://github.com/quazardous/qdadm).**

Vue 3 + TypeScript. Block-first. Context-aware. SPA.

---

## Why qdcms?

If qdadm is *Sonata in Vue* for the back-office, qdcms is the public-facing counterpart:

- **Block-centric** — pages emerge from blocks matched against the current context
- **Context-aware** — auth state, route, tenant, locale are first-class context dimensions
- **SPA only** — no SSR, no SSG, deployable on any CDN
- **PageComposer pluggable** — the default composer resolves blocks from placement rules; replace it to fetch composition from your API

```ts
import { createCms } from 'qdcms'

const cms = createCms()

cms.layout('default', DefaultLayout)

cms.block('site-nav', { component: SiteNav })
cms.place('site-nav', { region: 'header' })

cms.block('event-list', { component: EventList })
cms.place('event-list', { region: 'main', when: { route: '/events' } })

cms.block('my-bookings', { component: MyBookings })
cms.place('my-bookings', { region: 'aside', when: { auth: true } })
```

That's it. Visit `/events` while authenticated → header has nav, main has the event list, aside has the user's bookings.

---

## Status

**Pre-alpha**, framework scaffolding + working demo.

## Packages

| Package | Description |
|---------|-------------|
| [qdcms](packages/qdcms) | Core library (TypeScript) |
| [demo](packages/demo) | POC demo — block-centric composition |

## Development

```bash
npm install
npm run dev     # runs the demo on http://localhost:5180
```

## Philosophy

See [QDCMS_CREDO.md](./QDCMS_CREDO.md).
