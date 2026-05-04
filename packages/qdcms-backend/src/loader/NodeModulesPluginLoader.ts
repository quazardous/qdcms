/**
 * NodeModulesPluginLoader — discovers qdcms plugins in node_modules.
 *
 * Walks the host site's `node_modules`, finds packages whose
 * `package.json` carries `keywords: ["qdcms-plugin"]`, reads each
 * package's manifest YAML (path declared by `package.json#qdcms`,
 * defaults to `qdcms-plugin.yaml`), and produces ready-to-register
 * `Plugin` objects via `buildManifestFromPackageJson`.
 *
 * **Workspace-friendly.** npm/pnpm/yarn workspaces install plugins as
 * symlinks inside `node_modules` — `realpath` resolution turns symlinks
 * into actual paths but discovery itself doesn't care; we walk the
 * directory tree as-is.
 *
 * **Multi-version safe.** If two copies of the same plugin name appear
 * (e.g. a deep dependency tree pulled both `v1` and `v2`), the loader
 * raises `MultiVersionConflictError` rather than silently picking one
 * — qdcms enforces single-version-per-site (see docs/plugins.md §16).
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import {
  buildManifestFromPackageJson,
  type QdcmsPackageJson,
} from '@quazardous/qdcms-core/loader'
import type { Plugin } from '@quazardous/qdcms-core/plugin'

const QDCMS_PLUGIN_KEYWORD = 'qdcms-plugin'
const DEFAULT_YAML_NAME = 'qdcms-plugin.yaml'

// ─── Types ────────────────────────────────────────────────────────────────

export interface DiscoveredPlugin {
  /** Absolute filesystem path of the plugin package root. */
  path: string
  /** Parsed package.json. */
  packageJson: QdcmsPackageJson
  /** Raw YAML content of the qdcms-plugin manifest file. */
  qdcmsYaml: string
  /** The unified plugin object built via buildManifestFromPackageJson. */
  plugin: Plugin
}

export interface LoadFromNodeModulesOptions {
  /** Absolute path to the host site root (the directory containing `node_modules`). */
  hostPath: string
  /**
   * Optional override for the discovery keyword. Default: `qdcms-plugin`.
   * Useful for monorepo testing without shipping `keywords` on internal
   * packages.
   */
  keyword?: string
  /**
   * If true (default), rejects when two copies of the same plugin name
   * are found in different node_modules locations. Set false to keep
   * just the first one (rarely useful — for diagnostic dumps).
   */
  strictSingleVersion?: boolean
}

export interface LoadFromNodeModulesResult {
  plugins: DiscoveredPlugin[]
  /** Per-package errors that did not abort the load (e.g. malformed yaml). */
  errors: Array<{ path: string; error: Error }>
}

// ─── Errors ───────────────────────────────────────────────────────────────

export class MultiVersionConflictError extends Error {
  constructor(
    public readonly pluginName: string,
    public readonly paths: string[],
  ) {
    super(
      `multiple installations of plugin "${pluginName}" found:\n` +
        paths.map((p) => `  - ${p}`).join('\n') +
        `\nResolve with \`npm dedupe\` or align peerDependency ranges.`,
    )
    this.name = 'MultiVersionConflictError'
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────

/**
 * Discover and load all qdcms plugins from a host's node_modules.
 *
 * Scans the host's `node_modules` recursively (one level into scoped
 * packages: `@scope/pkg`). Returns the discovered plugins + a list of
 * non-fatal per-package errors.
 *
 * Throws `MultiVersionConflictError` when duplicate plugin names appear.
 */
export async function loadFromNodeModules(
  options: LoadFromNodeModulesOptions,
): Promise<LoadFromNodeModulesResult> {
  const keyword = options.keyword ?? QDCMS_PLUGIN_KEYWORD
  const strict = options.strictSingleVersion ?? true
  const nodeModulesDir = resolvePath(options.hostPath, 'node_modules')

  const plugins: DiscoveredPlugin[] = []
  const errors: LoadFromNodeModulesResult['errors'] = []

  await scanDir(nodeModulesDir, keyword, plugins, errors)

  // Multi-version detection.
  if (strict) {
    const byName = new Map<string, string[]>()
    for (const p of plugins) {
      const list = byName.get(p.packageJson.name) ?? []
      list.push(p.path)
      byName.set(p.packageJson.name, list)
    }
    for (const [name, paths] of byName) {
      if (paths.length > 1) {
        throw new MultiVersionConflictError(name, paths)
      }
    }
  }

  return { plugins, errors }
}

// ─── Internals ────────────────────────────────────────────────────────────

async function scanDir(
  dir: string,
  keyword: string,
  out: DiscoveredPlugin[],
  errors: LoadFromNodeModulesResult['errors'],
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // node_modules doesn't exist or unreadable — empty result, no error.
    return
  }

  for (const name of entries) {
    if (name.startsWith('.')) continue // .bin, .package-lock.json, etc.
    const full = join(dir, name)

    if (name.startsWith('@')) {
      // Scoped package directory — recurse one level into @scope/*.
      let inner: string[]
      try {
        inner = await readdir(full)
      } catch {
        continue
      }
      for (const sub of inner) {
        if (sub.startsWith('.')) continue
        await tryLoadPackage(join(full, sub), keyword, out, errors)
      }
      continue
    }

    await tryLoadPackage(full, keyword, out, errors)
  }
}

async function tryLoadPackage(
  packagePath: string,
  keyword: string,
  out: DiscoveredPlugin[],
  errors: LoadFromNodeModulesResult['errors'],
): Promise<void> {
  // Must be a directory.
  let s
  try {
    s = await stat(packagePath)
  } catch {
    return
  }
  if (!s.isDirectory()) return

  // Must have a package.json with our keyword.
  const pkgJsonPath = join(packagePath, 'package.json')
  let pkgRaw: string
  try {
    pkgRaw = await readFile(pkgJsonPath, 'utf8')
  } catch {
    return
  }

  let pkg: QdcmsPackageJson
  try {
    pkg = JSON.parse(pkgRaw) as QdcmsPackageJson
  } catch (cause) {
    errors.push({
      path: packagePath,
      error: new Error(`failed to parse package.json: ${(cause as Error).message}`),
    })
    return
  }

  if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes(keyword)) {
    return // not a qdcms plugin
  }

  // Resolve the YAML manifest path (default: qdcms-plugin.yaml).
  const yamlRel = typeof pkg.qdcms === 'string' ? pkg.qdcms : DEFAULT_YAML_NAME
  const yamlPath = join(packagePath, yamlRel)
  let qdcmsYaml: string
  try {
    qdcmsYaml = await readFile(yamlPath, 'utf8')
  } catch (cause) {
    errors.push({
      path: packagePath,
      error: new Error(
        `failed to read qdcms manifest "${yamlRel}": ${(cause as Error).message}`,
      ),
    })
    return
  }

  // Build the unified manifest. Adapter does its own validation.
  let plugin: Plugin
  try {
    const manifest = buildManifestFromPackageJson({ packageJson: pkg, qdcmsYaml })
    plugin = { manifest }
  } catch (cause) {
    errors.push({ path: packagePath, error: cause as Error })
    return
  }

  out.push({ path: packagePath, packageJson: pkg, qdcmsYaml, plugin })
}
