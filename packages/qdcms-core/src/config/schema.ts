/**
 * config/schema.ts — schema primitives for plugin/framework
 * config validation.
 *
 * Plugins (and the framework) declare the shape of their config
 * concepts via `defineConfigSchema(...)`. The compile pipeline
 * uses these to :
 *  - validate instance YAML at build time (fail-loud with file:line),
 *  - apply schema-declared defaults for fields the instance omitted,
 *  - emit `locked` warnings when a locked field is overridden,
 *  - emit `deprecated` warnings for fields/concepts on their way out.
 *
 * The implementation wraps Valibot — a small, tree-shakeable,
 * types-first validator — and adds qdcms-specific annotations
 * (`locked`, `overridable`, `default`, `deprecated`).
 *
 * See docs/config.md §5 for the full contract.
 */

import * as v from 'valibot'

// ─── annotation surface ────────────────────────────────────────────────────

export interface FieldOptions<T = unknown> {
  /** Whether the instance is allowed to override the plugin default (default: true). */
  overridable?: boolean
  /** Whether the field's value is locked once set by the plugin install. */
  locked?: boolean
  /** Whether the field may be absent. */
  optional?: boolean
  /** Schema-declared default — used when the instance YAML omits the field. */
  default?: T
  /** Deprecation declaration — surfaces a warning at compile time. */
  deprecated?: DeprecationInfo
}

export interface DeprecationInfo {
  /** First version that flagged this as deprecated. */
  since: string
  /** Field/concept/namespace to migrate to, when applicable. */
  replacement?: string
  /** Version in which this will become a hard error. */
  removeIn?: string
  /** Free-form context displayed alongside the warning. */
  message?: string
}

// ─── annotated schema wrapper ──────────────────────────────────────────────

/**
 * An annotated schema is the Valibot schema PLUS the qdcms-specific
 * annotations. The compile pipeline reads both layers : Valibot for
 * the value shape, our annotations for behaviour (defaults, locked,
 * deprecated).
 */
export interface AnnotatedSchema<T = unknown> {
  /** The underlying Valibot schema for runtime validation. */
  validator: v.GenericSchema<T>
  /** qdcms-specific annotations attached to this field/shape. */
  annotations: FieldOptions<T>
}

// ─── field builders ────────────────────────────────────────────────────────

/**
 * Field builders that return AnnotatedSchema. Each thin wrapper
 * around a Valibot schema captures qdcms-specific options.
 *
 * Usage :
 *   field.string({ default: '', deprecated: { since: '0.4.0' } })
 *   field.array(field.string(), { default: [] })
 *   field.object({ id: field.string({ locked: true }) })
 */
export const field = {
  string<O extends FieldOptions<string>>(opts: O = {} as O): AnnotatedSchema<string> {
    return { validator: v.string(), annotations: opts }
  },
  number<O extends FieldOptions<number>>(opts: O = {} as O): AnnotatedSchema<number> {
    return { validator: v.number(), annotations: opts }
  },
  boolean<O extends FieldOptions<boolean>>(opts: O = {} as O): AnnotatedSchema<boolean> {
    return { validator: v.boolean(), annotations: opts }
  },
  array<T>(item: AnnotatedSchema<T>, opts: FieldOptions<T[]> = {}): AnnotatedSchema<T[]> {
    return { validator: v.array(item.validator), annotations: opts }
  },
  object<S extends Record<string, AnnotatedSchema>>(
    shape: S,
    opts: FieldOptions<{ [K in keyof S]: InferAnnotated<S[K]> }> = {},
  ): AnnotatedSchema<{ [K in keyof S]: InferAnnotated<S[K]> }> {
    const validatorShape: Record<string, v.GenericSchema> = {}
    for (const [key, inner] of Object.entries(shape)) {
      validatorShape[key] = inner.annotations.optional
        ? v.optional(inner.validator)
        : inner.validator
    }
    return {
      validator: v.object(validatorShape) as unknown as v.GenericSchema<{
        [K in keyof S]: InferAnnotated<S[K]>
      }>,
      annotations: opts,
    }
  },
  literal<T extends string | number | boolean>(
    value: T,
    opts: FieldOptions<T> = {},
  ): AnnotatedSchema<T> {
    return { validator: v.literal(value), annotations: opts }
  },
  union<T>(
    options: AnnotatedSchema<T>[],
    opts: FieldOptions<T> = {},
  ): AnnotatedSchema<T> {
    return {
      validator: v.union(options.map((o) => o.validator)) as v.GenericSchema<T>,
      annotations: opts,
    }
  },
}

type InferAnnotated<S> = S extends AnnotatedSchema<infer T> ? T : never

// ─── concept + namespace declaration ───────────────────────────────────────

export interface ConceptSchemaInput<T = unknown> {
  /** Identifier for individual entries in collections (default: 'id'). Used by error messages. */
  identifyBy?: string
  /** The annotated schema describing the concept's value. */
  shape: AnnotatedSchema<T>
  /** Concept-level deprecation. */
  deprecated?: DeprecationInfo
}

export interface NamespaceSchemaInput {
  /** "qdcms" or "plugin-<short>". */
  namespace: string
  /** Plugin id that contributed this schema (informational, used in errors). */
  contributedBy: string
  /** Map of concept name → schema. */
  concepts: Record<string, ConceptSchemaInput>
  /** Namespace-level deprecation (the whole plugin's config sunset). */
  deprecated?: DeprecationInfo
}

/**
 * Declares a namespace schema. A plugin or the framework calls this
 * to register the shape of every concept it owns.
 */
export function defineConfigSchema(input: NamespaceSchemaInput): NamespaceSchema {
  return input as NamespaceSchema
}

export type NamespaceSchema = NamespaceSchemaInput
