/**
 * compile-config.ts — invoke the qdcms config compiler on demo/config/.
 *
 * Run via : `tsx demo/scripts/compile-config.ts` (from repo root)
 *      or : `npm run compile-config` (script defined in demo/frontend/package.json)
 *
 * Auto-runs before `npm run dev` and `npm run build` so the
 * .compiled/ artefacts are always fresh. The artefacts are
 * gitignored — every machine compiles them locally.
 *
 * Future (slice C7) : a Vite plugin replaces this script and
 * watches YAML changes for hot recompile during dev.
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { compileConfig } from '@quazardous/qdcms-core/config'

const here = dirname(fileURLToPath(import.meta.url))
const instanceDir = resolve(here, '..', 'config')

const result = await compileConfig({ instanceDir })
console.log(
  `[qdcms config:compile] ${result.outputs.length} file(s) emitted to ${instanceDir}/.compiled/`,
)
for (const ns of Object.keys(result.namespaces)) {
  const concepts = Object.keys(result.namespaces[ns]!)
  console.log(`  ${ns} → ${concepts.join(', ')}`)
}
