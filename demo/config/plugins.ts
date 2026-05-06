/**
 * config/plugins.ts — plugins shipped with the demo.
 *
 * Authoritative list for the in-tab (browser) backend : it derives
 * table prefixes and exposes /plugins from this. The classic Node
 * backend doesn't read this file — it discovers plugins by walking
 * `<QDCMS_CORE>/node_modules/` for packages keyworded `qdcms-plugin`.
 *
 * Future (Axis 8 / §6.6) : both backends should read the SAME
 * source of truth (a single compiled `plugins.yaml`) so the demo
 * can't drift between modes.
 */

import type { BrowserPlugin } from '@quazardous/qdcms-backend/browser'

export const plugins: BrowserPlugin[] = [
  {
    id: '@quazardous/qdcms-plugin-core',
    version: '0.1.0',
    prefix: 'core',
    title: 'Core',
    tables: ['user', 'session'],
  },
  {
    id: 'demo',
    version: '0.1.0',
    prefix: 'demo',
    title: 'Demo content',
    tables: ['realization'],
  },
]
