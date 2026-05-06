/**
 * packageJsonAdapter — build a PluginManifest from
 * `package.json` + `qdcms-plugin.yaml`.
 *
 * **The contract for npm-distributed plugins.** A qdcms plugin is an
 * npm package whose `package.json` carries:
 *
 *   {
 *     "name": "@scope/qdcms-plugin-foo",            ← becomes manifest.id
 *     "version": "1.2.3",                            ← becomes manifest.version
 *     "keywords": ["qdcms-plugin"],                  ← marks the package for
 *                                                       discovery in node_modules
 *     "qdcms": "qdcms-plugin.yaml",                  ← relative path to the yaml
 *     "peerDependencies": {                          ← inter-plugin deps
 *       "@scope/qdcms-plugin-core": "^1.0.0"
 *     }
 *   }
 *
 * And whose `qdcms-plugin.yaml` carries the qdcms-specific bits:
 *
 *   prefix: foo
 *   entities: { ... }
 *   extensions: { ... }
 *   schemaManaged: true
 *
 * This module merges both into the unified runtime PluginManifest shape.
 *
 * The future Phase 3 NodeModulesPluginLoader will scan node_modules,
 * find packages with the `qdcms-plugin` keyword, and call this adapter
 * for each. For now the adapter exists as the documented contract — host
 * apps can call it directly.
 */

import { parse as parseYaml } from 'yaml'
import {
  PluginValidationError,
  type PluginManifest,
} from '../plugin/types'
import { validateManifest } from '../plugin/validation'

/**
 * Subset of the standard package.json fields we care about. Other fields
 * (description, scripts, etc.) are ignored.
 */
export interface QdcmsPackageJson {
  name: string
  version: string
  keywords?: string[]
  /** Path (relative to the package root) of the qdcms-plugin yaml file. */
  qdcms?: string
  /** All declared peer dependencies. We filter to qdcms plugins via the keyword convention. */
  peerDependencies?: Record<string, string>
  /** Allowed but discouraged: regular `dependencies` for inter-plugin links. */
  dependencies?: Record<string, string>
}

export interface BuildManifestInput {
  /** Parsed `package.json` of the plugin. */
  packageJson: QdcmsPackageJson
  /** Raw text of the qdcms-plugin yaml. */
  qdcmsYaml: string
  /**
   * Predicate identifying which dependency entries are themselves qdcms
   * plugins. Default: matches any name containing `qdcms-plugin`. Use
   * a custom predicate when scoping convention differs (e.g. consult
   * the candidate package.json for `keywords: ["qdcms-plugin"]` — the
   * proper Phase 3 implementation will read the resolved peer's
   * package.json directly).
   */
  isPluginDependency?: (depName: string) => boolean
  /**
   * If true (default), validates the produced manifest with the
   * standard validator. Set false if the host wants to validate later.
   */
  validate?: boolean
}

/**
 * Build a unified PluginManifest from package.json + qdcms-plugin.yaml.
 *
 * Throws PluginValidationError on:
 * - missing or non-string package.json#name / #version
 * - yaml parse failure
 * - yaml top-level not a mapping
 * - yaml contains forbidden fields (id, version, dependencies — those
 *   come from package.json; YAML having them = author confusion)
 * - validateManifest failure (when validate=true, default)
 */
export function buildManifestFromPackageJson(
  input: BuildManifestInput,
): PluginManifest {
  const { packageJson, qdcmsYaml } = input
  const validate = input.validate ?? true
  const isPluginDep = input.isPluginDependency ?? defaultIsPluginDependency

  if (!packageJson || typeof packageJson !== 'object') {
    throw new PluginValidationError('package.json is not an object')
  }
  if (typeof packageJson.name !== 'string' || !packageJson.name) {
    throw new PluginValidationError('package.json.name is required')
  }
  if (typeof packageJson.version !== 'string' || !packageJson.version) {
    throw new PluginValidationError('package.json.version is required', packageJson.name)
  }

  // Parse YAML
  let yamlDoc: unknown
  try {
    yamlDoc = parseYaml(qdcmsYaml)
  } catch (cause) {
    throw new PluginValidationError(
      `qdcms-plugin.yaml: failed to parse: ${(cause as Error).message}`,
      packageJson.name,
    )
  }
  if (!yamlDoc || typeof yamlDoc !== 'object' || Array.isArray(yamlDoc)) {
    throw new PluginValidationError(
      'qdcms-plugin.yaml: top-level must be a YAML mapping',
      packageJson.name,
    )
  }

  const yamlObj = yamlDoc as Record<string, unknown>

  // Forbidden YAML fields — these belong in package.json.
  for (const forbidden of ['id', 'version', 'dependencies'] as const) {
    if (forbidden in yamlObj) {
      throw new PluginValidationError(
        `qdcms-plugin.yaml: "${forbidden}" must not be set in the YAML — ` +
          `it comes from package.json (npm-pure mode, see docs/plugins.md §16)`,
        packageJson.name,
      )
    }
  }

  // Build dependencies from peerDependencies (preferred) ∪ dependencies
  // that match the plugin predicate.
  const allDeps: Record<string, string> = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  }
  const dependencies = Object.entries(allDeps)
    .filter(([name]) => isPluginDep(name))
    .map(([id, version]) => ({ id, version }))

  // Compose final manifest. YAML gives `entities:` as a mapping
  // (keyed by entity logical name) — our PluginManifest type wants an
  // array of EntityDescriptor with `name` explicit, so convert.
  const entities =
    yamlObj.entities && typeof yamlObj.entities === 'object'
      ? entitiesFromYaml(yamlObj.entities as Record<string, unknown>, packageJson.name)
      : undefined

  const manifest: PluginManifest = {
    id: packageJson.name,
    version: packageJson.version,
    prefix: typeof yamlObj.prefix === 'string' ? yamlObj.prefix : '',
    title: typeof yamlObj.title === 'string' ? yamlObj.title : undefined,
    description:
      typeof yamlObj.description === 'string' ? yamlObj.description : undefined,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    entities,
    extensions: yamlObj.extensions as PluginManifest['extensions'] | undefined,
    schemaManaged:
      typeof yamlObj.schemaManaged === 'boolean' ? yamlObj.schemaManaged : undefined,
  }

  if (validate) {
    validateManifest(manifest)
  }
  return manifest
}

/**
 * Convert the YAML `entities:` mapping into the array form
 * `EntityDescriptor[]` expected by `PluginManifest`. YAML keys become
 * `name`. Each entry must have at least `tableName` and `fields`.
 */
function entitiesFromYaml(
  obj: Record<string, unknown>,
  pluginId: string,
): PluginManifest['entities'] {
  const out: NonNullable<PluginManifest['entities']> = []
  for (const [name, raw] of Object.entries(obj)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new PluginValidationError(
        `qdcms-plugin.yaml: entity "${name}" must be a mapping`,
        pluginId,
      )
    }
    const def = raw as Record<string, unknown>
    // tableName defaults to the entity logical name when omitted —
    // common case (entity `user` → tableName `users` is just sugar
    // when the author wants pluralization, otherwise `user` works).
    const tableName =
      typeof def.tableName === 'string' && def.tableName.length > 0
        ? def.tableName
        : name
    if (!def.fields || typeof def.fields !== 'object') {
      throw new PluginValidationError(
        `qdcms-plugin.yaml: entity "${name}" is missing fields`,
        pluginId,
      )
    }
    out.push({
      name,
      tableName,
      fields: def.fields as NonNullable<PluginManifest['entities']>[number]['fields'],
      indexes: Array.isArray(def.indexes)
        ? (def.indexes as NonNullable<PluginManifest['entities']>[number]['indexes'])
        : undefined,
    })
  }
  return out
}

/**
 * Default heuristic: a dep is a qdcms plugin if its name contains
 * `qdcms-plugin` (e.g. `@scope/qdcms-plugin-foo`, `qdcms-plugin-bar`).
 *
 * The Phase 3 NodeModulesPluginLoader will replace this with a proper
 * check on each peer's package.json#keywords.
 */
export function defaultIsPluginDependency(name: string): boolean {
  return name.includes('qdcms-plugin')
}
