/**
 * qdcms CLI entry — bootstraps oclif, discovers plugin commands,
 * runs the requested command.
 *
 * Plugin command extensibility : at boot, the CLI walks
 * `<QDCMS_CORE>/node_modules/` for packages keyworded
 * `qdcms-plugin` AND declaring `oclif.commands` in their
 * `package.json`. Each is loaded as an oclif plugin so its
 * commands appear under `qdcms <topic>:<cmd>` in the same
 * binary. See docs/cli.md §4 for the contributor contract.
 *
 * Discovery happens once at boot (cheap fs walk). Future
 * optimisation : cache the plugin list keyed on QDCMS_CORE +
 * node_modules mtime.
 */

import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { Config, Errors, Plugin, flush, run } from '@oclif/core'
import { discoverPluginRoots, findQdcmsCore } from './discover-plugins'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = dirname(here)

const config = new Config({ root: pkgRoot })
await config.load()

const corePath = findQdcmsCore()
for (const pluginRoot of discoverPluginRoots(corePath)) {
  try {
    const plugin = new Plugin({ root: pluginRoot, type: 'core' })
    await plugin.load()
    config.plugins.set(plugin.name, plugin)
  } catch (e) {
    process.stderr.write(
      `[qdcms] skipped plugin at ${pluginRoot} : ${
        e instanceof Error ? e.message : String(e)
      }\n`,
    )
  }
}

try {
  await run(process.argv.slice(2), config)
  await flush()
} catch (error) {
  await Errors.handle(error as Error)
}
