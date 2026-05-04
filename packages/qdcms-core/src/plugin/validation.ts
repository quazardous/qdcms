/**
 * Pure manifest validation helpers. Used by the registry on register and
 * exposed as standalone exports so consumer apps can pre-validate manifests
 * (e.g. CLI codegen, YAML loader).
 */

import { valid as validSemver, validRange } from 'semver'
import {
  PluginValidationError,
  type PluginManifest,
} from './types'

const ID_RE = /^[a-z][a-z0-9_-]*$/
const PREFIX_RE = /^[a-z][a-z0-9_]*$/

export function isValidPluginId(id: string): boolean {
  return ID_RE.test(id)
}

export function isValidPluginPrefix(prefix: string): boolean {
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

/**
 * Whether a string is a valid semver RANGE (e.g. `'^1.0.0'`,
 * `'>=2.3.0'`, `'1.x'`). Used for validating dependency constraints.
 * Empty string and `'*'` both mean "any" and are valid.
 */
export function isValidSemverRange(range: string): boolean {
  if (range === '' || range === '*') return true
  return validRange(range) !== null
}

/**
 * Validate a manifest. Throws `PluginValidationError` on the first issue.
 *
 * Rationale: validation must be all-or-nothing at register time so the
 * registry never holds partial / inconsistent entries. Tests assert each
 * error class via the message prefix.
 */
export function validateManifest(manifest: PluginManifest): void {
  if (!manifest || typeof manifest !== 'object') {
    throw new PluginValidationError('manifest is not an object')
  }
  if (!manifest.id) {
    throw new PluginValidationError('manifest.id is required')
  }
  if (!isValidPluginId(manifest.id)) {
    throw new PluginValidationError(
      `manifest.id "${manifest.id}" must match ${ID_RE} (lowercase, [a-z0-9_-], starts with a letter)`,
      manifest.id,
    )
  }
  if (!manifest.version) {
    throw new PluginValidationError('manifest.version is required', manifest.id)
  }
  if (!isValidSemver(manifest.version)) {
    throw new PluginValidationError(
      `manifest.version "${manifest.version}" is not valid semver`,
      manifest.id,
    )
  }
  if (!manifest.prefix) {
    throw new PluginValidationError('manifest.prefix is required', manifest.id)
  }
  if (!isValidPluginPrefix(manifest.prefix)) {
    throw new PluginValidationError(
      `manifest.prefix "${manifest.prefix}" must match ${PREFIX_RE} (lowercase, [a-z0-9_], starts with a letter, no dashes)`,
      manifest.id,
    )
  }
  if (manifest.dependencies) {
    if (!Array.isArray(manifest.dependencies)) {
      throw new PluginValidationError(
        'manifest.dependencies must be an array',
        manifest.id,
      )
    }
    for (const dep of manifest.dependencies) {
      if (!dep || typeof dep !== 'object') {
        throw new PluginValidationError(
          `manifest.dependencies entry must be an object`,
          manifest.id,
        )
      }
      if (!isValidPluginId(dep.id)) {
        throw new PluginValidationError(
          `manifest.dependencies entry has invalid id "${dep.id}"`,
          manifest.id,
        )
      }
      if (dep.version !== undefined && !isValidSemverRange(dep.version)) {
        throw new PluginValidationError(
          `dependency on "${dep.id}" has invalid version range "${dep.version}"`,
          manifest.id,
        )
      }
    }
  }
  if (manifest.extensions) {
    if (typeof manifest.extensions !== 'object' || Array.isArray(manifest.extensions)) {
      throw new PluginValidationError(
        'manifest.extensions must be an object keyed by table name',
        manifest.id,
      )
    }
    for (const tableName of Object.keys(manifest.extensions)) {
      if (!PREFIX_RE.test(tableName.split('_')[0] ?? '')) {
        throw new PluginValidationError(
          `manifest.extensions table "${tableName}" should start with a plugin prefix segment`,
          manifest.id,
        )
      }
    }
  }
}
