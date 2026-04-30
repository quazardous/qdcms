import { createCms, DefaultLayout, DefaultPageComposer } from 'qdcms'

import SiteNav from './blocks/SiteNav.vue'
import SiteFooter from './blocks/SiteFooter.vue'
import Hero from './blocks/Hero.vue'
import EventList from './blocks/EventList.vue'
import EventDetail from './blocks/EventDetail.vue'
import EventBreadcrumb from './blocks/EventBreadcrumb.vue'
import LoginCta from './blocks/LoginCta.vue'
import MyBookings from './blocks/MyBookings.vue'

import LandingLayout from './layouts/LandingLayout.vue'

// Custom composer: chooses the layout based on the active stack.
// Demonstrates that the composer is fully replaceable — and that it should
// reason on the stack, not on the URL.
export const cms = createCms({
  composer: (blocks, placements) =>
    new DefaultPageComposer(blocks, placements, {
      resolveLayout: (ctx) => {
        const top = ctx.stack[ctx.stack.length - 1]
        if (top?.type === 'page' && top.name === 'home') return 'landing'
        return 'default'
      },
    }),
})

// ──────────────────────────────────────────────────────────────────────
// LAYOUTS
// ──────────────────────────────────────────────────────────────────────
cms.layout('default', DefaultLayout, ['header', 'main', 'aside', 'footer'])
cms.layout('landing', LandingLayout, ['header', 'hero', 'main', 'footer'])

// ──────────────────────────────────────────────────────────────────────
// BLOCKS — register once, definitions are inert
// ──────────────────────────────────────────────────────────────────────
cms.block('site-nav', { component: SiteNav })
cms.block('site-footer', { component: SiteFooter })
cms.block('hero', {
  component: Hero,
  schema: {
    title: { type: 'string', label: 'Title', default: 'Krorg' },
    tagline: { type: 'string', label: 'Tagline' },
  },
})
cms.block('event-list', {
  component: EventList,
  scope: 'public',
  schema: { limit: { type: 'number', label: 'Items per page', default: 10 } },
})
cms.block('event-detail', { component: EventDetail, scope: 'public' })
cms.block('event-breadcrumb', { component: EventBreadcrumb, scope: 'public' })
cms.block('login-cta', { component: LoginCta, scope: 'anonymous-only' })
cms.block('my-bookings', { component: MyBookings, scope: 'authenticated' })

// ──────────────────────────────────────────────────────────────────────
// PLACEMENTS — block-centric, stack-driven
// ──────────────────────────────────────────────────────────────────────

// Site chrome — no stack condition, always present.
cms.place('site-nav', { region: 'header', weight: 0 })
cms.place('site-footer', { region: 'footer', weight: 100 })

// Anonymous-only login CTA in the header
cms.place('login-cta', {
  region: 'header',
  weight: 50,
  when: { auth: false },
})

// Hero on the home page — matches the stack, not the URL.
cms.place('hero', {
  region: 'hero',
  when: { stack: { top: { type: 'page', name: 'home' } } },
  props: { title: 'Krorg', tagline: 'Schedule resources for your association' },
})

// Event list when the stack ends at the events collection.
cms.place('event-list', {
  region: 'main',
  when: { stack: { top: { type: 'collection', name: 'events' } } },
  props: { limit: 5 },
})

// Event detail when the stack ends at an event item.
// Demonstrates `props` as a function: the block receives `slug` derived from
// the active stack — no cms coupling inside the block component itself.
cms.place('event-detail', {
  region: 'main',
  when: { stack: { top: { type: 'item', name: 'event' } } },
  props: (ctx) => ({ slug: ctx.stack[ctx.stack.length - 1]?.id ?? null }),
})

// Breadcrumb for any event-related page (collection OR item) — uses `contains`.
cms.place('event-breadcrumb', {
  region: 'main',
  weight: -100,  // before the main content
  when: { stack: { contains: { name: 'events' }, depth: { min: 2 } } },
})

// "My bookings" widget — appears in aside whenever the user is authenticated
cms.place('my-bookings', {
  region: 'aside',
  when: { auth: true },
  weight: 10,
})
