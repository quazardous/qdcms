/**
 * config/validate.ts — runs schemas against parsed config values,
 * emits warnings (deprecated) and errors (type mismatch, missing
 * required fields), and applies schema-declared defaults.
 *
 * Returns the typed final value alongside diagnostics, never throws
 * for a soft warning. Hard errors aggregate into a single thrown
 * error with all violations listed (so the author can fix more than
 * one at a time).
 */

import * as v from 'valibot'
import type {
  AnnotatedSchema,
  ConceptSchemaInput,
  DeprecationInfo,
  FieldOptions,
  NamespaceSchema,
} from './schema'

export interface CompileWarning {
  level: 'warning'
  kind: 'deprecated' | 'locked'
  message: string
  source?: string
}

export interface ValidateConceptResult {
  value: unknown
  warnings: CompileWarning[]
}

/**
 * Validate a single concept's value against its schema, applying
 * defaults and gathering warnings.
 */
export function validateConcept(
  schemas: NamespaceSchema,
  concept: string,
  value: unknown,
  source: string,
): ValidateConceptResult {
  const conceptSchema = schemas.concepts[concept]
  if (!conceptSchema) {
    throw new Error(
      `[qdcms config:compile] unknown concept '${schemas.namespace}.${concept}' ` +
        `(declared in ${source}). Schemas registered for namespace '${schemas.namespace}' : ` +
        `${Object.keys(schemas.concepts).join(', ') || '(none)'}. ` +
        `Contributed by ${schemas.contributedBy}.`,
    )
  }

  const warnings: CompileWarning[] = []

  // Concept-level deprecation.
  if (conceptSchema.deprecated) {
    warnings.push(deprecationWarning(
      `concept '${schemas.namespace}.${concept}'`,
      conceptSchema.deprecated,
      source,
    ))
  }
  // Namespace-level deprecation.
  if (schemas.deprecated) {
    warnings.push(deprecationWarning(
      `namespace '${schemas.namespace}'`,
      schemas.deprecated,
      source,
    ))
  }

  // Apply schema defaults to fill missing fields, walking the shape
  // recursively. The annotated `shape` IS the concept value's
  // schema (an array, object, scalar, etc).
  const withDefaults = applyDefaults(conceptSchema.shape, value, [
    `${schemas.namespace}.${concept}`,
  ], warnings, source)

  // Run Valibot validation. Aggregate issues into a single throw
  // for ergonomic compile output.
  const result = v.safeParse(conceptSchema.shape.validator, withDefaults)
  if (!result.success) {
    const issues = result.issues
      .map((i) => `  - ${pathOf(i)}: ${i.message}`)
      .join('\n')
    throw new Error(
      `[qdcms config:compile] schema validation failed for ` +
        `'${schemas.namespace}.${concept}' (in ${source}) :\n${issues}\n` +
        `Schema contributed by ${schemas.contributedBy}.`,
    )
  }

  return { value: result.output, warnings }
}

// ─── _internal: defaults application ───────────────────────────────────────

function applyDefaults(
  schema: AnnotatedSchema,
  value: unknown,
  path: string[],
  warnings: CompileWarning[],
  source: string,
): unknown {
  // Field-level deprecation.
  if (schema.annotations.deprecated && value !== undefined) {
    warnings.push(deprecationWarning(
      `field '${path.join('.')}'`,
      schema.annotations.deprecated,
      source,
    ))
  }

  // If value missing and a default is declared, use it.
  if (value === undefined || value === null) {
    if (schema.annotations.default !== undefined) {
      return schema.annotations.default
    }
    if (schema.annotations.optional) return undefined
    return value
  }

  // For object schemas, recurse into known keys.
  // We detect "object schema" by introspecting the wrapped Valibot
  // schema kind. v.object exposes `entries` after instantiation.
  const wrapped = schema.validator as unknown as { type?: string; entries?: Record<string, unknown> }
  if (wrapped.type === 'object' && wrapped.entries && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    // Walk shape entries — but we don't have direct access to
    // child AnnotatedSchemas here (only the validator entries).
    // Defaults at child level were captured at builder time and
    // would need re-introspection ; for now return shallow.
    return out
  }
  return value
}

// ─── _internal: deprecation message format ─────────────────────────────────

function deprecationWarning(
  what: string,
  info: DeprecationInfo,
  source: string,
): CompileWarning {
  const parts: string[] = [
    `${what} is deprecated since ${info.since}`,
  ]
  if (info.replacement) parts.push(`replacement: ${info.replacement}`)
  if (info.removeIn) parts.push(`will be removed in: ${info.removeIn}`)
  if (info.message) parts.push(`note: ${info.message}`)
  return {
    level: 'warning',
    kind: 'deprecated',
    message: parts.join(' — '),
    source,
  }
}

// ─── _internal: Valibot issue path formatter ───────────────────────────────

function pathOf(issue: { path?: Array<{ key?: unknown }> }): string {
  if (!issue.path || issue.path.length === 0) return '(root)'
  return issue.path
    .map((p) => (typeof p.key === 'number' ? `[${p.key}]` : `${p.key}`))
    .join('.')
}
