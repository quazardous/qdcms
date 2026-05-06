/**
 * config/types.ts — public types for the qdcms config compiler.
 *
 * The compiler reads `<instance>/config/qdcms.*.yaml` and
 * `<instance>/config/plugin-<short>.*.yaml`, normalises the two
 * authoring shapes (concept-named vs self-keyed, see
 * docs/config.md §3.2), and emits typed TS modules under
 * `<instance>/config/.compiled/`.
 *
 * Validation, schema discovery, default merging, and caching are
 * handled in subsequent slices (C5+) ; this slice is pure shape
 * normalisation.
 */

import type { NamespaceSchema } from './schema'
import type { CompileWarning } from './validate'

export interface CompileConfigOptions {
  /**
   * Absolute path to the instance config directory (where the
   * YAML files live). The compiled output goes to
   * `<instanceDir>/.compiled/` unless `outDir` is given.
   */
  instanceDir: string

  /**
   * Where to write the compiled `.ts` modules. Defaults to
   * `<instanceDir>/.compiled`.
   */
  outDir?: string

  /**
   * Extra schemas (beyond the framework's built-ins) to register
   * for validation. Plugin discovery will populate this list
   * automatically in a follow-up slice ; tests can pass schemas
   * directly here.
   */
  schemas?: NamespaceSchema[]

  /**
   * Disable the compile cache (force a fresh recompile). Useful
   * for CI gates that want to validate from scratch and for
   * tests. Default false.
   */
  noCache?: boolean
}

export interface CompileConfigResult {
  /**
   * Map of namespace ("qdcms" or "plugin-<short>") → concepts
   * found and their resolved values (after schema-default
   * application). Useful for diagnostics and tests.
   */
  namespaces: Record<string, Record<string, unknown>>

  /**
   * Files written to `outDir`. Includes the `index.ts` aggregator.
   */
  outputs: string[]

  /**
   * Soft warnings collected during validation (deprecated fields,
   * locked-field overrides). Hard errors throw ; warnings flow
   * through here so the caller can log/render them.
   */
  warnings: CompileWarning[]

  /**
   * Cache outcome. `hit: true` means the entire compile was a
   * no-op (timestamp pre-check passed). `skippedConcepts` counts
   * concepts whose per-concept hash matched the cache and didn't
   * need a fresh emit.
   */
  cache: {
    hit: boolean
    skippedConcepts: number
  }
}

/**
 * One YAML file's metadata, used internally during normalisation.
 *
 * `shape` distinguishes the two authoring forms :
 * - `concept-named` : filename ends in `<concept>.yaml`, body IS
 *   the concept value (e.g. `qdcms.locales.yaml` containing
 *   `['en', 'fr']`).
 * - `self-keyed` : filename ends at the namespace
 *   (`<namespace>.yaml`), body is `{ concept1: ..., concept2: ... }`.
 */
export interface ParsedConfigFile {
  /** Absolute path of the source YAML file. */
  path: string
  /** Filename without extension. */
  basename: string
  /** Namespace : "qdcms" or "plugin-<short>". */
  namespace: string
  /** "concept-named" or "self-keyed", inferred from basename. */
  shape: 'concept-named' | 'self-keyed'
  /**
   * The concept name when shape is "concept-named" ; null for
   * self-keyed (concepts come from the YAML body keys).
   */
  conceptHint: string | null
  /** Raw parsed YAML body. */
  body: unknown
}
