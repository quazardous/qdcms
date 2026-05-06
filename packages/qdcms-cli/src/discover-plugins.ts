/**
 * discover-plugins.ts — walk `<QDCMS_CORE>/node_modules/` for
 * qdcms plugins that ship oclif commands.
 *
 * Selection criteria : a package qualifies when its `package.json`
 * has BOTH :
 *  - `keywords` includes `'qdcms-plugin'`,
 *  - `oclif.commands` declared (the path to its commands dir).
 *
 * The walker handles both scoped (`@quazardous/qdcms-plugin-dc`)
 * and unscoped packages. Returns absolute paths of plugin
 * package roots. Cheap : a couple of `readdir` + `readFile` calls,
 * sub-millisecond on a warm FS cache.
 *
 * Future (CLI-5+): cache the result keyed on
 * `<QDCMS_CORE>/node_modules` mtime to skip the walk entirely on
 * unchanged states.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

export function findQdcmsCore(start: string = process.cwd()): string {
  if (process.env.QDCMS_CORE) return resolve(process.env.QDCMS_CORE)
  let dir = resolve(start)
  while (true) {
    if (existsSync(join(dir, 'node_modules'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

export function discoverPluginRoots(corePath: string): string[] {
  const nm = join(corePath, 'node_modules')
  if (!existsSync(nm)) return []
  const out: string[] = []

  for (const entry of readdirSync(nm, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('.')) continue

    if (entry.name.startsWith('@')) {
      const scopeDir = join(nm, entry.name)
      let scopedEntries: ReturnType<typeof readdirSync>
      try {
        scopedEntries = readdirSync(scopeDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const sub of scopedEntries) {
        if (!sub.isDirectory() && !sub.isSymbolicLink()) continue
        const pkgRoot = join(scopeDir, sub.name)
        if (isQdcmsPluginCli(pkgRoot)) out.push(pkgRoot)
      }
    } else {
      const pkgRoot = join(nm, entry.name)
      if (isQdcmsPluginCli(pkgRoot)) out.push(pkgRoot)
    }
  }
  return out.sort()
}

function isQdcmsPluginCli(pkgRoot: string): boolean {
  const pkgJson = join(pkgRoot, 'package.json')
  if (!existsSync(pkgJson)) return false
  try {
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'))
    const hasKeyword =
      Array.isArray(pkg.keywords) && pkg.keywords.includes('qdcms-plugin')
    const hasCommands =
      pkg.oclif && typeof pkg.oclif.commands === 'string'
    return Boolean(hasKeyword && hasCommands)
  } catch {
    return false
  }
}
