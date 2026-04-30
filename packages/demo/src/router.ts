import { createRouter, createWebHistory } from 'vue-router'
import { PageRenderer, type StackLevelMetaTemplate } from 'qdcms'

// Every public route renders the same PageRenderer. The composer decides
// what fills it based on the active stack derived from `meta.stack`.
//
// This is the heart of block-centric: routes ship a *stack template*, not a
// page component. The stack is the matching surface; routes are just inputs.

declare module 'vue-router' {
  interface RouteMeta {
    stack?: StackLevelMetaTemplate[]
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'home' }] },
    },
    {
      path: '/events',
      component: PageRenderer,
      meta: { stack: [{ type: 'collection', name: 'events' }] },
    },
    {
      path: '/events/:slug',
      component: PageRenderer,
      meta: {
        stack: [
          { type: 'collection', name: 'events' },
          { type: 'item', name: 'event', idParam: 'slug' },
        ],
      },
    },
    {
      path: '/courts',
      component: PageRenderer,
      meta: { stack: [{ type: 'collection', name: 'courts' }] },
    },
    {
      path: '/me',
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'me' }] },
    },
    {
      path: '/me/bookings',
      component: PageRenderer,
      meta: {
        stack: [
          { type: 'page', name: 'me' },
          { type: 'collection', name: 'bookings', params: { scope: 'self' } },
        ],
      },
    },
    { path: '/:pathMatch(.*)*', component: PageRenderer, meta: { stack: [] } },
  ],
})
