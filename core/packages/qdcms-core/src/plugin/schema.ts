/**
 * Plugin Valibot schema + validator.
 *
 * The Kernel calls `validatePlugin(unknown)` at the discovery boundary
 * — wherever a plugin instance arrives (dynamic-imported npm package,
 * local file scan, instance-config bootstrap, …). Malformed plugins
 * are rejected with a single `PluginValidationError` carrying the
 * aggregated Valibot issues.
 *
 * This is a **structural** validation : we check the shape of the
 * declared properties (id format, prefix regex, semver, hooks are
 * functions), not their runtime behaviour. Behavioural correctness
 * is the plugin author's responsibility.
 */

import * as v from 'valibot'
import { isValidSemver } from '../registry/validation'
import type { Plugin } from './types'

// ─── Sub-validators ──────────────────────────────────────────────────────

const ID_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const PREFIX_RE = /^[a-z][a-z0-9_]*$/
const NAME_RE = /^[a-z][a-z0-9_-]*$/

const idSchema = v.pipe(
  v.string('id must be a string'),
  v.regex(ID_RE, 'id must be a lowercase npm-style identifier'),
)

const prefixSchema = v.pipe(
  v.string('prefix must be a string'),
  v.regex(PREFIX_RE, 'prefix must be /^[a-z][a-z0-9_]*$/ (no dashes)'),
)

const nameSchema = v.pipe(
  v.string('name must be a string'),
  v.regex(NAME_RE, 'name must be /^[a-z][a-z0-9_-]*$/'),
)

const versionSchema = v.pipe(
  v.string('version must be a string'),
  v.check(
    (val) => isValidSemver(val),
    'version must be valid semver (X.Y.Z[-pre][+build], no `v` prefix)',
  ),
)

// Configurable arrays — content shape varies (NamespaceSchema, Migration,
// EntityDescriptor are validated at the consuming layer). Here we just
// confirm "is an array" and elements are objects. Stricter checks at
// install time.
const arrayOfObjects = (label: string) =>
  v.array(
    v.pipe(
      v.unknown(),
      v.check(
        (val) => val !== null && typeof val === 'object' && !Array.isArray(val),
        `${label} entries must be objects`,
      ),
    ),
    `${label} must be an array of objects`,
  )

const arrayOfStrings = (label: string) =>
  v.array(v.string(`${label} entries must be strings`), `${label} must be an array of strings`)

const fn = (label: string) =>
  v.pipe(
    v.unknown(),
    v.check((val) => typeof val === 'function', `${label} must be a function`),
  )

// ─── Plugin schema ───────────────────────────────────────────────────────

export const PluginSchema = v.object({
  // Identity
  id: idSchema,
  version: versionSchema,
  prefix: prefixSchema,
  name: nameSchema,

  // Topology
  requires: v.optional(arrayOfStrings('requires')),
  replaces: v.optional(arrayOfStrings('replaces')),
  weight: v.optional(v.number('weight must be a number')),

  // Contributions
  configSchemas: arrayOfObjects('configSchemas'),
  entities: arrayOfObjects('entities'),
  migrations: arrayOfObjects('migrations'),
  dropsConfigSchemas: v.optional(arrayOfStrings('dropsConfigSchemas')),

  // Hooks (functions when present; install/uninstall mandatory)
  install: fn('install'),
  uninstall: fn('uninstall'),
  registerHttpRoutes: v.optional(fn('registerHttpRoutes')),
  connect: v.optional(fn('connect')),
  disconnect: v.optional(fn('disconnect')),
})

// ─── Error + validator ───────────────────────────────────────────────────

export class PluginValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: readonly v.BaseIssue<unknown>[],
    public readonly pluginId?: string,
  ) {
    super(message)
    this.name = 'PluginValidationError'
  }
}

/**
 * Validate an unknown value as a Plugin. Returns the typed Plugin on
 * success, throws `PluginValidationError` with the aggregated issues
 * on failure.
 *
 * Usage at the discovery boundary :
 *
 *   const mod = await import(pluginPackageMain)
 *   const plugin = validatePlugin(mod.default)
 *   kernel.registerPlugin(plugin)
 */
export function validatePlugin(value: unknown): Plugin {
  const result = v.safeParse(PluginSchema, value)
  if (!result.success) {
    const id =
      value && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
        ? value.id
        : undefined
    const lines = result.issues.map((i) => `  - ${formatIssue(i)}`).join('\n')
    throw new PluginValidationError(
      `plugin ${id ? `"${id}" ` : ''}validation failed :\n${lines}`,
      result.issues,
      id,
    )
  }
  // Cast through unknown : Valibot's parsed result is structurally
  // compatible with Plugin (same fields, narrower types) but the
  // function signatures aren't carried by the parser — Plugin's hooks
  // require a stricter typing than the validator can express.
  return result.output as unknown as Plugin
}

function formatIssue(issue: v.BaseIssue<unknown>): string {
  const path = issue.path?.map((p) => p.key).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
