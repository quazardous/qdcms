/**
 * qdcms CLI entry — bootstraps oclif, runs the requested command.
 *
 * Plugin command extensibility (CLI-5 slice) : at boot, the CLI
 * walks `<QDCMS_CORE>/node_modules/` for packages keyworded
 * `qdcms-plugin` AND declaring `oclif` in their package.json,
 * loads them as oclif plugins so their commands appear under
 * `qdcms <topic>:<cmd>` in the same binary. Documented contract
 * in `docs/cli.md` §4 ; implementation deferred to CLI-5.
 */

import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { execute } from '@oclif/core'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = dirname(here)

await execute({ dir: pkgRoot })
