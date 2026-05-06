/**
 * parseUpgradeFile — turns YAML text into a typed UpgradeFile.
 *
 * Validates:
 * - top-level shape (description / min_version / steps)
 * - each step is a single-key object whose key matches a known kind
 * - minimum required fields per step kind
 *
 * Does NOT validate:
 * - that referenced entities/fields exist (that's the runner's job, with
 *   the manifest in hand)
 * - that script files exist (loader's job)
 *
 * Throws UpgradeFileError on the first issue with a path-prefixed message.
 */

import { parse as parseYaml } from 'yaml'
import { isValidSemver } from '../../registry/validation'
import {
  UpgradeFile,
  UpgradeFileError,
  type UpgradeStep,
} from './types'

const KNOWN_STEP_KINDS = new Set([
  'rename_field',
  'add_field',
  'drop_field',
  'rename_table',
  'change_type',
  'add_index',
  'drop_index',
  'script',
])

export interface ParseUpgradeFileInput {
  /** Raw YAML content. */
  content: string
  /** Source path for error messages and as `targetVersion` derivation. */
  filePath: string
  /**
   * Semver version this file targets — typically derived from the
   * filename (`upgrades/<version>.yaml` → `<version>`). Required;
   * the parser doesn't try to extract it from the filename.
   */
  targetVersion: string
}

export function parseUpgradeFile(input: ParseUpgradeFileInput): UpgradeFile {
  const { content, filePath, targetVersion } = input

  if (!isValidSemver(targetVersion)) {
    throw new UpgradeFileError(
      `target version "${targetVersion}" is not valid semver`,
      filePath,
    )
  }

  let doc: unknown
  try {
    doc = parseYaml(content)
  } catch (cause) {
    throw new UpgradeFileError(
      `failed to parse YAML: ${(cause as Error).message}`,
      filePath,
      cause,
    )
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new UpgradeFileError(
      'top-level must be a YAML mapping (object)',
      filePath,
    )
  }

  const obj = doc as Record<string, unknown>

  // description (optional)
  const description = typeof obj.description === 'string' ? obj.description : undefined

  // min_version (optional)
  let minVersion: string | undefined
  if (obj.min_version !== undefined) {
    if (typeof obj.min_version !== 'string') {
      throw new UpgradeFileError('min_version must be a string', filePath)
    }
    if (!isValidSemver(obj.min_version)) {
      throw new UpgradeFileError(
        `min_version "${obj.min_version}" is not valid semver`,
        filePath,
      )
    }
    minVersion = obj.min_version
  }

  // steps (required)
  if (!obj.steps) {
    throw new UpgradeFileError('steps is required', filePath)
  }
  if (!Array.isArray(obj.steps)) {
    throw new UpgradeFileError('steps must be an array', filePath)
  }
  if (obj.steps.length === 0) {
    throw new UpgradeFileError('steps array is empty', filePath)
  }

  const steps: UpgradeStep[] = obj.steps.map((raw, idx) =>
    parseStep(raw, idx, filePath),
  )

  return { targetVersion, filePath, description, minVersion, steps }
}

// ─── Step-level parsing ───────────────────────────────────────────────────

function parseStep(raw: unknown, idx: number, filePath: string): UpgradeStep {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new UpgradeFileError(
      `steps[${idx}] must be a mapping with one key (the step kind)`,
      filePath,
    )
  }
  const obj = raw as Record<string, unknown>
  // A step is a single-key object whose key is the kind. The script
  // step may carry a sibling `description` — handle that as a special case.
  // Determine the kind: the first key that matches a known kind wins.
  const kindKey = Object.keys(obj).find((k) => KNOWN_STEP_KINDS.has(k))
  if (!kindKey) {
    const keys = Object.keys(obj).join(', ')
    throw new UpgradeFileError(
      `steps[${idx}] has no recognised step kind. Got keys: [${keys}]. Expected one of: ${[...KNOWN_STEP_KINDS].join(', ')}`,
      filePath,
    )
  }

  switch (kindKey) {
    case 'rename_field':
      return parseRenameField(obj.rename_field, idx, filePath)
    case 'add_field':
      return parseAddField(obj.add_field, idx, filePath)
    case 'drop_field':
      return parseDropField(obj.drop_field, idx, filePath)
    case 'rename_table':
      return parseRenameTable(obj.rename_table, idx, filePath)
    case 'change_type':
      return parseChangeType(obj.change_type, idx, filePath)
    case 'add_index':
      return parseAddIndex(obj.add_index, idx, filePath)
    case 'drop_index':
      return parseDropIndex(obj.drop_index, idx, filePath)
    case 'script':
      return parseScript(obj.script, obj.description, idx, filePath)
    default:
      // Should be unreachable; KNOWN_STEP_KINDS gates kindKey.
      throw new UpgradeFileError(`steps[${idx}] unhandled kind "${kindKey}"`, filePath)
  }
}

function asMapping(value: unknown, label: string, filePath: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UpgradeFileError(`${label} body must be a mapping`, filePath)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, label: string, filePath: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new UpgradeFileError(`${label} must be a non-empty string`, filePath)
  }
  return value
}

function parseRenameField(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].rename_field`, filePath)
  return {
    kind: 'rename_field',
    entity: asString(m.entity, `steps[${idx}].rename_field.entity`, filePath),
    from: asString(m.from, `steps[${idx}].rename_field.from`, filePath),
    to: asString(m.to, `steps[${idx}].rename_field.to`, filePath),
  }
}

function parseAddField(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].add_field`, filePath)
  return {
    kind: 'add_field',
    entity: asString(m.entity, `steps[${idx}].add_field.entity`, filePath),
    field: asString(m.field, `steps[${idx}].add_field.field`, filePath),
    // Optional. If absent, executor falls back to looking up the field
    // in the manifest (works for fields that survived to the target).
    type:
      m.type !== undefined
        ? asString(m.type, `steps[${idx}].add_field.type`, filePath)
        : undefined,
    length: typeof m.length === 'number' ? m.length : undefined,
    nullable: typeof m.nullable === 'boolean' ? m.nullable : undefined,
    backfill_from:
      m.backfill_from !== undefined
        ? asString(m.backfill_from, `steps[${idx}].add_field.backfill_from`, filePath)
        : undefined,
    backfill_default: m.backfill_default,
    backfill_sql:
      m.backfill_sql !== undefined
        ? asString(m.backfill_sql, `steps[${idx}].add_field.backfill_sql`, filePath)
        : undefined,
  }
}

function parseDropField(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].drop_field`, filePath)
  return {
    kind: 'drop_field',
    entity: asString(m.entity, `steps[${idx}].drop_field.entity`, filePath),
    field: asString(m.field, `steps[${idx}].drop_field.field`, filePath),
  }
}

function parseRenameTable(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].rename_table`, filePath)
  return {
    kind: 'rename_table',
    from: asString(m.from, `steps[${idx}].rename_table.from`, filePath),
    to: asString(m.to, `steps[${idx}].rename_table.to`, filePath),
  }
}

function parseChangeType(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].change_type`, filePath)
  return {
    kind: 'change_type',
    entity: asString(m.entity, `steps[${idx}].change_type.entity`, filePath),
    field: asString(m.field, `steps[${idx}].change_type.field`, filePath),
    cast:
      m.cast !== undefined
        ? asString(m.cast, `steps[${idx}].change_type.cast`, filePath)
        : undefined,
  }
}

function parseAddIndex(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].add_index`, filePath)
  if (!Array.isArray(m.fields) || m.fields.some((f) => typeof f !== 'string' || !f)) {
    throw new UpgradeFileError(
      `steps[${idx}].add_index.fields must be a non-empty array of strings`,
      filePath,
    )
  }
  return {
    kind: 'add_index',
    entity: asString(m.entity, `steps[${idx}].add_index.entity`, filePath),
    fields: m.fields as string[],
    unique: m.unique === true,
    name:
      m.name !== undefined
        ? asString(m.name, `steps[${idx}].add_index.name`, filePath)
        : undefined,
  }
}

function parseDropIndex(value: unknown, idx: number, filePath: string): UpgradeStep {
  const m = asMapping(value, `steps[${idx}].drop_index`, filePath)
  return {
    kind: 'drop_index',
    entity: asString(m.entity, `steps[${idx}].drop_index.entity`, filePath),
    name: asString(m.name, `steps[${idx}].drop_index.name`, filePath),
  }
}

function parseScript(
  scriptValue: unknown,
  description: unknown,
  idx: number,
  filePath: string,
): UpgradeStep {
  // `script:` value is the path string directly (not a mapping).
  return {
    kind: 'script',
    script: asString(scriptValue, `steps[${idx}].script`, filePath),
    description:
      typeof description === 'string' && description !== '' ? description : undefined,
  }
}
