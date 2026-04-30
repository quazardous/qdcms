import { createRouter, createWebHistory } from 'vue-router'
import { PageRenderer, type StackLevelMetaTemplate } from 'qdcms'

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
      path: '/realisations',
      component: PageRenderer,
      meta: { stack: [{ type: 'collection', name: 'realisations' }] },
    },
    {
      path: '/realisations/:slug',
      component: PageRenderer,
      meta: {
        stack: [
          { type: 'collection', name: 'realisations' },
          { type: 'item', name: 'realisation', idParam: 'slug' },
        ],
      },
    },
    {
      path: '/prestations',
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'prestations' }] },
    },
    {
      path: '/demarche',
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'demarche' }] },
    },
    {
      path: '/contact',
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'contact' }] },
    },
    {
      path: '/me',
      component: PageRenderer,
      meta: { stack: [{ type: 'page', name: 'me' }] },
    },
    { path: '/:pathMatch(.*)*', component: PageRenderer, meta: { stack: [] } },
  ],
})
