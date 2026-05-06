# qdcms

**Block-centric public framework for Vue 3 SPAs, paired with [qdadm](https://github.com/quazardous/qdadm).**

A page is not an object. A page **emerges** from the blocks whose placement conditions match the current context (route, stack, auth, tenant, locale).

> ⚠ Pre-alpha — API may change.

## Install

```bash
npm install qdcms vue vue-router
```

## Quick start

```ts
import { createCms, DefaultLayout, bindRouter } from 'qdcms'
import { createRouter, createWebHistory } from 'vue-router'
import { createApp } from 'vue'
import App from './App.vue'

const cms = createCms()

cms.layout('default', DefaultLayout, ['header', 'main', 'footer'])

cms.block('site-nav', { component: SiteNav })
cms.place('site-nav', { region: 'header' })

cms.block('event-list', { component: EventList })
cms.place('event-list', {
  region: 'main',
  when: { stack: { top: { type: 'collection', name: 'events' } } },
})

cms.block('my-bookings', { component: MyBookings })
cms.place('my-bookings', { region: 'aside', when: { auth: true } })

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', meta: { stack: [{ type: 'page', name: 'home' }] } },
    { path: '/events', meta: { stack: [{ type: 'collection', name: 'events' }] } },
  ],
})

bindRouter(router, cms)

createApp(App).use(router).use(cms).mount('#app')
```

## Concepts

- **Block** — a Vue component declared once, placed N times via placement rules.
- **Placement** — a rule that decides where (region, weight) and when (`when: { auth, stack, route, ... }`) a block appears.
- **Stack** — the canonical matching surface, derived from the URL via a pluggable `StackBuilder`. Reflects the navigation context (page → collection → item).
- **Composer** — resolves the active layout + blocks for a given context. Default is in-memory; replaceable by API or hybrid composers.

## Status

- ✅ Core registries (block / placement / layout)
- ✅ Default + API + Overlay composers (sync + async, race-safe)
- ✅ Stack-based matching with `StackBuilder` primitive
- ✅ vue-router binding
- ✅ Test suite (Vitest)
- 🚧 Locale-aware StackBuilder
- 🚧 Vue component test coverage
- 🚧 qdadm bridge package

## License

MIT — see [LICENSE](./LICENSE).
