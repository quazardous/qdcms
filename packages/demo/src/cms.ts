import { createCms, DefaultLayout, DefaultPageComposer } from 'qdcms'

import SiteNav from './blocks/SiteNav.vue'
import SiteFooter from './blocks/SiteFooter.vue'
import Hero from './blocks/Hero.vue'
import Intro from './blocks/Intro.vue'
import PortfolioGrid from './blocks/PortfolioGrid.vue'
import RealizationDetail from './blocks/RealizationDetail.vue'
import ServicesList from './blocks/ServicesList.vue'
import Demarche from './blocks/Demarche.vue'
import ContactBlock from './blocks/ContactBlock.vue'
import Breadcrumb from './blocks/Breadcrumb.vue'
import LoginCta from './blocks/LoginCta.vue'
import UserPill from './blocks/UserPill.vue'
import ProWelcome from './blocks/ProWelcome.vue'
import MyProjects from './blocks/MyProjects.vue'

import LandingLayout from './layouts/LandingLayout.vue'

// Composer chooses layout based on the active stack.
// Home → landing (with hero region); everything else → default.
export const cms = createCms({
  composer: (blocks, placements, layouts) =>
    new DefaultPageComposer(blocks, placements, {
      layouts,
      resolveLayout: (ctx) => {
        const top = ctx.stack[ctx.stack.length - 1]
        if (top?.type === 'page' && top.name === 'home') return 'landing'
        return 'default'
      },
    }),
})

// ─── LAYOUTS ─────────────────────────────────────────────────────────
cms.layout('default', DefaultLayout, ['header', 'main', 'footer'])
cms.layout('landing', LandingLayout, ['header', 'hero', 'main', 'footer'])

// ─── BLOCKS ──────────────────────────────────────────────────────────
cms.block('site-nav', { component: SiteNav })
cms.block('site-footer', { component: SiteFooter })
cms.block('hero', { component: Hero })
cms.block('intro', { component: Intro })
cms.block('portfolio-grid', { component: PortfolioGrid })
cms.block('realization-detail', { component: RealizationDetail })
cms.block('services-list', { component: ServicesList })
cms.block('demarche', { component: Demarche })
cms.block('contact', { component: ContactBlock })
cms.block('breadcrumb', { component: Breadcrumb })
cms.block('login-cta', { component: LoginCta })
cms.block('user-pill', { component: UserPill })
cms.block('pro-welcome', { component: ProWelcome })
cms.block('my-projects', { component: MyProjects })

// ─── PLACEMENTS ─────────────────────────────────────────────────────

// Site chrome — always present.
cms.place('site-nav', { region: 'header', weight: 0 })
cms.place('site-footer', { region: 'footer', weight: 100 })

// Login CTA in header for anonymous; UserPill when authenticated.
cms.place('login-cta', { region: 'header', weight: 50, when: { auth: false } })
cms.place('user-pill', { region: 'header', weight: 50, when: { auth: true } })

// ─── HOME (landing) ─────────────────────────────────────────────────
cms.place('hero', {
  region: 'hero',
  when: { stack: { top: { type: 'page', name: 'home' } } },
  props: {
    eyebrow: 'Atelier floral · Bordeaux',
    title: 'Compositions vivantes, locales et de saison.',
    tagline: 'Mariages, événements, lieux de vie. Chaque pièce est composée à partir de ce qui pousse, ici, maintenant.',
    cta: 'Voir les réalisations',
    ctaTo: '/realisations',
  },
})

cms.place('intro', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'home' } } },
  props: {
    eyebrow: 'Notre approche',
    body: `Pas de catalogue, pas de chaîne de froid mondiale. Juste une lecture
attentive de la saison et de ton projet — et une composition qui en découle.
Chaque mariage, chaque événement est unique parce que mai n'est pas septembre,
et que la pivoine ne ressemble pas au dahlia.`,
  },
})

cms.place('portfolio-grid', {
  region: 'main',
  weight: 10,
  when: { stack: { top: { type: 'page', name: 'home' } } },
  props: { limit: 3, heading: 'Quelques réalisations récentes' },
})

// ─── PORTFOLIO COLLECTION ──────────────────────────────────────────
cms.place('breadcrumb', {
  region: 'main',
  weight: -100,
  when: { stack: { contains: { name: 'realisations' }, depth: { min: 2 } } },
})

cms.place('portfolio-grid', {
  region: 'main',
  when: { stack: { top: { type: 'collection', name: 'realisations' } } },
  props: {
    heading: 'Toutes les réalisations',
    lead: 'Chaque projet est documenté ici quelques semaines après. Cliquer pour le détail.',
  },
})

// ─── REALIZATION DETAIL ────────────────────────────────────────────
cms.place('realization-detail', {
  region: 'main',
  when: { stack: { top: { type: 'item', name: 'realisation' } } },
  props: (ctx) => ({ slug: ctx.stack[ctx.stack.length - 1]?.id ?? null }),
})

// ─── PRESTATIONS / DÉMARCHE / CONTACT ──────────────────────────────
cms.place('services-list', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'prestations' } } },
})

cms.place('demarche', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'demarche' } } },
})

cms.place('contact', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'contact' } } },
})

// ─── PRO SPACE (auth-only) ─────────────────────────────────────────
cms.place('pro-welcome', {
  region: 'main',
  weight: -10,
  when: { stack: { top: { type: 'page', name: 'me' } }, auth: true },
})

cms.place('my-projects', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'me' } }, auth: true },
})

// Anonymous user landing on /me → redirect-style message
cms.place('intro', {
  region: 'main',
  when: { stack: { top: { type: 'page', name: 'me' } }, auth: false },
  props: {
    eyebrow: 'Espace réservé',
    body: `Cet espace est réservé aux clients en cours de projet. Connecte-toi
en haut à droite pour le découvrir (en démo, le bouton fonctionne sans mot de passe).`,
  },
})
