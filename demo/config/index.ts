/**
 * config/index.ts — re-export aggregator.
 *
 * Per §6.6, each concept lives in its own file (locales, plugins,
 * seed, slug-table…). This barrel makes the whole config available
 * as one object for the shell, without forcing consumers to know
 * the internal split.
 *
 * Today : straight TS modules. Tomorrow (§6.6) : YAML files
 * compiled into `config/.compiled/` and re-exported by a generated
 * `index.ts` of the same shape.
 */

export { LOCALES, DEFAULT_LOCALE } from './locales'
export { slugTable } from './slug-table'
export { plugins } from './plugins'
export { seed } from './seed'

import { plugins } from './plugins'
import { seed } from './seed'
import type { BrowserPlugin, BrowserSeed } from '@quazardous/qdcms-backend/browser'

export interface QdcmsAppConfig {
  plugins: BrowserPlugin[]
  seed: BrowserSeed
}

const config: QdcmsAppConfig = { plugins, seed }
export default config
