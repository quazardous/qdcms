/**
 * config/index.ts — re-export aggregator.
 *
 * Concepts split between :
 *  - YAML files compiled to `.compiled/` by `qdcms config:compile`
 *    (today: locales, plugins). Source of truth for config.
 *  - TS files still here for concepts that carry JS references the
 *    YAML compiler can't represent yet (slug-table has Vue
 *    component refs ; seed imports from content/). These will move
 *    to YAML once the page-types plugin (Axis 1) lands and the
 *    component refs are by-id rather than by-import.
 *
 * Consumers import from this barrel, never from .compiled/ or the
 * raw .ts files directly — the indirection lets us swap the source
 * without touching call sites.
 */

import qdcmsLocales from '../.compiled/config/qdcms.locales'
import qdcmsPlugins from '../.compiled/config/qdcms.plugins'
import { seed } from './seed'
import type { Locale } from 'qdcms'
import type { BrowserPlugin, BrowserSeed } from '@quazardous/qdcms-backend/browser'

export const LOCALES: Locale[] = qdcmsLocales.list as Locale[]
export const DEFAULT_LOCALE: Locale = qdcmsLocales.default as Locale
export const plugins: BrowserPlugin[] = qdcmsPlugins as BrowserPlugin[]
export { slugTable } from './slug-table'
export { seed }

export interface QdcmsAppConfig {
  plugins: BrowserPlugin[]
  seed: BrowserSeed
}

const config: QdcmsAppConfig = { plugins, seed }
export default config
