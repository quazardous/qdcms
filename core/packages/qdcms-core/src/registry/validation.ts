/**
 * Pure manifest validation helpers. Used by the registry on register and
 * exposed as standalone exports so consumer apps can pre-validate
 * manifests (e.g. CLI codegen, YAML loader).
 */

import { valid as validSemver } from 'semver'
import {
  ComponentValidationError,
  type ComponentManifest,
} from './types'

// Manifest id == npm package name (npm-pure mode). Accept scoped names
// (`@scope/name`) and the standard npm character set: lowercase
// letters, digits, hyphens, dots, underscores. Must start with a
// letter or digit (not `_` or `.`).
const ID_RE =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const PREFIX_RE = /^[a-z][a-z0-9_]*$/

export function isValidComponentManifestId(id: string): boolean {
  return ID_RE.test(id)
}

export function isValidComponentManifestPrefix(prefix: string): boolean {
  return PREFIX_RE.test(prefix)
}

export function isValidSemver(version: string): boolean {
  // `valid()` returns the cleaned version string for a strict semver
  // (X.Y.Z[-pre][+build]) or null otherwise. Booleanise.
  // Note: semver lib accepts the `v` prefix as shorthand
  // (`valid('v1.0.0') === '1.0.0'`); we reject it to keep manifests
  // strict (matches npm's own package.json policy).
  if (version.startsWith('v') || version.startsWith('V')) return false
  return validSemver(version) !== null
}

// NOTE: dependency `version` ranges in the manifest are no longer
// validated by qdcms — npm is authoritative for plugin distribution and
// version resolution (see docs/plugins.md §16). The version field on
// each ComponentDependency is informational; npm's lockfile is the source
// of truth for which version is actually present in node_modules.

/**
 * Validate a manifest. Throws `ComponentValidationError` on the first issue.
 *
 * Rationale: validation must be all-or-nothing at register time so the
 * registry never holds partial / inconsistent entries. Tests assert
 * each error class via the message prefix.
 */
export function validateComponentManifest(manifest: ComponentManifest): void {
  if (!manifest || typeof manifest !== 'object') {
    throw new ComponentValidationError('manifest is not an object')
  }
  if (!manifest.id) {
    throw new ComponentValidationError('manifest.id is required')
  }
  if (!isValidComponentManifestId(manifest.id)) {
    throw new ComponentValidationError(
      `manifest.id "${manifest.id}" must match ${ID_RE} (lowercase, [a-z0-9_-], starts with a letter or digit)`,
      manifest.id,
    )
  }
  if (!manifest.version) {
    throw new ComponentValidationError('manifest.version is required', manifest.id)
  }
  if (!isValidSemver(manifest.version)) {
    throw new ComponentValidationError(
      `manifest.version "${manifest.version}" is not valid semver`,
      manifest.id,
    )
  }
  if (!manifest.prefix) {
    throw new ComponentValidationError('manifest.prefix is required', manifest.id)
  }
  if (!isValidComponentManifestPrefix(manifest.prefix)) {
    throw new ComponentValidationError(
      `manifest.prefix "${manifest.prefix}" must match ${PREFIX_RE} (lowercase, [a-z0-9_], starts with a letter, no dashes)`,
      manifest.id,
    )
  }
  if (manifest.dependencies) {
    if (!Array.isArray(manifest.dependencies)) {
      throw new ComponentValidationError(
        'manifest.dependencies must be an array',
        manifest.id,
      )
    }
    for (const dep of manifest.dependencies) {
      if (!dep || typeof dep !== 'object') {
        throw new ComponentValidationError(
          `manifest.dependencies entry must be an object`,
          manifest.id,
        )
      }
      if (!isValidComponentManifestId(dep.id)) {
        throw new ComponentValidationError(
          `manifest.dependencies entry has invalid id "${dep.id}"`,
          manifest.id,
        )
      }
      // dep.version is intentionally NOT validated here — npm is
      // authoritative for version resolution. We carry the range as
      // informational metadata (admin UI, error messages).
    }
  }
  if (manifest.extensions) {
    if (typeof manifest.extensions !== 'object' || Array.isArray(manifest.extensions)) {
      throw new ComponentValidationError(
        'manifest.extensions must be an object keyed by table name',
        manifest.id,
      )
    }
    for (const tableName of Object.keys(manifest.extensions)) {
      if (!PREFIX_RE.test(tableName.split('_')[0] ?? '')) {
        throw new ComponentValidationError(
          `manifest.extensions table "${tableName}" should start with a manifest prefix segment`,
          manifest.id,
        )
      }
    }
  }
}
