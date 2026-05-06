/**
 * config/compile.ts — instance config compiler.
 *
 * Reads YAML files from `<instanceDir>/`, normalises their
 * authoring shape (see docs/config.md §3.2), and emits typed TS
 * modules into `<outDir>` (default `<instanceDir>/.compiled`).
 *
 * Scope of THIS slice (C3+C4) :
 *  - file globbing (qdcms.*.yaml, plugin-*.yaml),
 *  - YAML parsing,
 *  - concept-named vs self-keyed normalisation,
 *  - duplicate-concept detection,
 *  - per-concept TS emission + index aggregator.
 *
 * Out of scope (future slices) :
 *  - schema discovery + validation (C5),
 *  - hash + timestamp cache (C6),
 *  - watch mode + Vite plugin (C7),
 *  - deprecation warnings (C8),
 *  - admin write-back / export-import (C9).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { builtinSchemas } from './builtin-schemas'
import type { NamespaceSchema } from './schema'
import { validateConcept, type CompileWarning } from './validate'
import type {
  CompileConfigOptions,
  CompileConfigResult,
  ParsedConfigFile,
} from './types'

const QDCMS_NAMESPACE = 'qdcms'
const PLUGIN_NAMESPACE_PREFIX = 'plugin-'

const FRAMEWORK_FILE_REGEX = /^qdcms(?:\.([^.]+(?:\.[^.]+)*))?\.yaml$/
const PLUGIN_FILE_REGEX = /^(plugin-[^.]+)(?:\.([^.]+(?:\.[^.]+)*))?\.yaml$/

export async function compileConfig(
  options: CompileConfigOptions,
): Promise<CompileConfigResult> {
  const instanceDir = resolve(options.instanceDir)
  const outDir = resolve(options.outDir ?? join(instanceDir, '.compiled'))

  if (!existsSync(instanceDir)) {
    throw new Error(
      `[qdcms config:compile] instanceDir does not exist: ${instanceDir}`,
    )
  }

  const files = listConfigFiles(instanceDir)
  const parsed = files.map(parseFile)
  const aggregated = aggregate(parsed)

  // Schema registry : built-in framework schemas + (later) plugin
  // schemas discovered via plugin manifests. The latter is wired in
  // a follow-up slice (C5 cont.) once plugin discovery for SCHEMAS
  // (not just runtime code) is plumbed.
  const schemasByNamespace: Record<string, NamespaceSchema> = {}
  for (const s of [...builtinSchemas, ...(options.schemas ?? [])]) {
    schemasByNamespace[s.namespace] = s
  }

  // Validate every concept against the schema for its namespace.
  // Schema-less namespaces : pass-through (warn — proper plugins
  // SHOULD ship a schema, but we don't break the build for partial
  // setups during the migration).
  const validated: Record<string, Record<string, unknown>> = {}
  const warnings: CompileWarning[] = []
  for (const [ns, concepts] of Object.entries(aggregated)) {
    const schema = schemasByNamespace[ns]
    validated[ns] = {}
    for (const [concept, value] of Object.entries(concepts)) {
      if (!schema) {
        // No schema known for this namespace — pass-through and
        // emit a one-time note. Plugins should ship a schema ;
        // until they do, the compile still works on raw YAML.
        validated[ns]![concept] = value
        continue
      }
      const r = validateConcept(schema, concept, value, sourceOf(parsed, ns, concept))
      validated[ns]![concept] = r.value
      warnings.push(...r.warnings)
    }
  }

  mkdirSync(outDir, { recursive: true })
  const outputs = emit(validated, outDir)

  return { namespaces: validated, outputs, warnings }
}

function sourceOf(
  parsed: ParsedConfigFile[],
  ns: string,
  concept: string,
): string {
  for (const f of parsed) {
    if (f.namespace !== ns) continue
    if (f.shape === 'concept-named' && f.conceptHint === concept) return f.path
    if (f.shape === 'self-keyed') return f.path
  }
  return `(unknown source for ${ns}.${concept})`
}

// ─── _internal: file discovery ─────────────────────────────────────────────

function listConfigFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.yaml')) continue
    if (
      !entry.name.startsWith(QDCMS_NAMESPACE + '.') &&
      entry.name !== QDCMS_NAMESPACE + '.yaml' &&
      !entry.name.startsWith(PLUGIN_NAMESPACE_PREFIX)
    ) {
      throw new Error(
        `[qdcms config:compile] file '${entry.name}' is not in a recognised ` +
          `namespace. Expected 'qdcms.*.yaml' or 'plugin-<short>.*.yaml'.`,
      )
    }
    out.push(join(dir, entry.name))
  }
  return out.sort()
}

// ─── _internal: YAML parsing + shape detection ─────────────────────────────

function parseFile(path: string): ParsedConfigFile {
  const raw = readFileSync(path, 'utf8')
  const body = parseYaml(raw)
  const basename = path.split('/').pop()!.replace(/\.yaml$/, '')

  // Framework namespace (qdcms.*)
  const fwMatch = FRAMEWORK_FILE_REGEX.exec(basename + '.yaml')
  if (fwMatch) {
    const conceptHint = fwMatch[1] ?? null
    return {
      path,
      basename,
      namespace: QDCMS_NAMESPACE,
      shape: conceptHint ? 'concept-named' : 'self-keyed',
      conceptHint,
      body,
    }
  }

  // Plugin namespace (plugin-<short>.*)
  const pluginMatch = PLUGIN_FILE_REGEX.exec(basename + '.yaml')
  if (pluginMatch) {
    const namespace = pluginMatch[1]!
    const conceptHint = pluginMatch[2] ?? null
    return {
      path,
      basename,
      namespace,
      shape: conceptHint ? 'concept-named' : 'self-keyed',
      conceptHint,
      body,
    }
  }

  throw new Error(
    `[qdcms config:compile] cannot parse namespace from '${basename}.yaml'`,
  )
}

// ─── _internal: aggregation + duplicate detection ──────────────────────────

function aggregate(
  parsed: ParsedConfigFile[],
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  // Track which file declared each concept so duplicates produce a clear error.
  const sources: Record<string, Record<string, string>> = {}

  for (const file of parsed) {
    const ns = (out[file.namespace] ??= {})
    const nsSources = (sources[file.namespace] ??= {})

    if (file.shape === 'concept-named') {
      const concept = file.conceptHint!
      if (concept in ns) {
        throw new Error(
          `[qdcms config:compile] concept '${file.namespace}.${concept}' ` +
            `declared in multiple files :\n` +
            `  - ${nsSources[concept]}\n` +
            `  - ${file.path}\n` +
            `Pick one and remove the other.`,
        )
      }
      ns[concept] = file.body
      nsSources[concept] = file.path
    } else {
      // self-keyed : body must be an object whose keys are concept names.
      if (
        !file.body ||
        typeof file.body !== 'object' ||
        Array.isArray(file.body)
      ) {
        throw new Error(
          `[qdcms config:compile] self-keyed file '${file.path}' must contain ` +
            `an object whose keys are concept names. Got ${
              Array.isArray(file.body) ? 'array' : typeof file.body
            }.`,
        )
      }
      for (const [concept, value] of Object.entries(
        file.body as Record<string, unknown>,
      )) {
        if (concept in ns) {
          throw new Error(
            `[qdcms config:compile] concept '${file.namespace}.${concept}' ` +
              `declared in multiple files :\n` +
              `  - ${nsSources[concept]}\n` +
              `  - ${file.path} (key '${concept}')\n` +
              `Pick one and remove the other.`,
          )
        }
        ns[concept] = value
        nsSources[concept] = file.path
      }
    }
  }
  return out
}

// ─── _internal: emit .compiled/*.ts ────────────────────────────────────────

function emit(
  namespaces: Record<string, Record<string, unknown>>,
  outDir: string,
): string[] {
  const outputs: string[] = []
  const indexExports: string[] = []

  for (const [ns, concepts] of Object.entries(namespaces)) {
    for (const [concept, value] of Object.entries(concepts)) {
      const filename = `${ns}.${concept}.ts`
      const path = join(outDir, filename)
      writeFileSync(path, renderModule(ns, concept, value))
      outputs.push(path)
      indexExports.push(
        `export { default as ${jsId(ns, concept)} } from './${ns}.${concept}'`,
      )
    }
  }

  const indexPath = join(outDir, 'index.ts')
  writeFileSync(indexPath, renderIndex(indexExports))
  outputs.push(indexPath)

  return outputs.sort()
}

function renderModule(ns: string, concept: string, value: unknown): string {
  return [
    `// status: generated — produced by \`qdcms config:compile\``,
    `// source : ${ns}.${concept} concept (see docs/config.md)`,
    ``,
    `const value = ${JSON.stringify(value, null, 2)} as const`,
    ``,
    `export default value`,
    ``,
  ].join('\n')
}

function renderIndex(exports: string[]): string {
  return [
    `// status: generated — produced by \`qdcms config:compile\``,
    `// Aggregator barrel for all compiled config modules.`,
    ``,
    ...exports.sort(),
    ``,
  ].join('\n')
}

// `qdcms.locales` → `qdcmsLocales`
// `plugin-dc.types` → `pluginDcTypes`
function jsId(ns: string, concept: string): string {
  return camel(`${ns}-${concept}`)
}

function camel(s: string): string {
  return s
    .split(/[-.]/)
    .map((part, i) =>
      i === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('')
}
