/**
 * Upgrade hints — types.
 *
 * Hint files live in `<plugin>/upgrades/<target-version>.yaml`. The
 * filename IS the target version; the source version is implicit
 * (whatever was installed before, in the chain).
 *
 * Top-level shape:
 *   description?: string       — human-readable summary
 *   min_version?: string       — semver guard; refuses if instance is below
 *   steps: UpgradeStep[]       — required, the actual work
 *
 * Steps are a discriminated union — the property name discriminates.
 * E.g. `{ rename_field: { entity, from, to } }` is an UpgradeStep with
 * `kind === 'rename_field'`.
 */

// ─── Step variants (discriminated union) ──────────────────────────────────

export interface RenameFieldStep {
  kind: 'rename_field'
  entity: string
  from: string
  to: string
}

export interface AddFieldStep {
  kind: 'add_field'
  entity: string
  field: string
  /**
   * Field type — REQUIRED. Hints must be self-contained because a field
   * added in v1.5 may be dropped in v2.0; the v1.5 hint cannot rely on
   * the current manifest to look up its type.
   */
  type?: string
  /** Optional length (for `string`). */
  length?: number
  /** Allow NULL on the new column. Defaults to true (additive change). */
  nullable?: boolean
  /** Source column name to copy data from on existing rows. */
  backfill_from?: string
  /** Literal default value applied to existing rows when added. */
  backfill_default?: unknown
  /** Raw SQL expression evaluated to compute the value per row. */
  backfill_sql?: string
}

export interface DropFieldStep {
  kind: 'drop_field'
  entity: string
  field: string
}

export interface RenameTableStep {
  kind: 'rename_table'
  from: string
  to: string
}

export interface ChangeTypeStep {
  kind: 'change_type'
  entity: string
  field: string
  /**
   * Optional raw cast expression — used when the dialect requires
   * USING clause or a function. Otherwise the new column type is
   * picked from the manifest.
   */
  cast?: string
}

export interface AddIndexStep {
  kind: 'add_index'
  entity: string
  fields: string[]
  unique?: boolean
  name?: string
}

export interface DropIndexStep {
  kind: 'drop_index'
  entity: string
  name: string
}

export interface ScriptStep {
  kind: 'script'
  /** Path relative to the upgrade YAML file. */
  script: string
  description?: string
}

export type UpgradeStep =
  | RenameFieldStep
  | AddFieldStep
  | DropFieldStep
  | RenameTableStep
  | ChangeTypeStep
  | AddIndexStep
  | DropIndexStep
  | ScriptStep

// ─── Top-level upgrade file ───────────────────────────────────────────────

export interface UpgradeFile {
  /** The semver version this file's hints upgrade INTO. */
  targetVersion: string
  /** Source path on disk; useful for resolving relative `script:` refs. */
  filePath: string
  description?: string
  /** If set, refuses to apply when the instance is below this version. */
  minVersion?: string
  steps: UpgradeStep[]
}

// ─── Errors ───────────────────────────────────────────────────────────────

export class UpgradeFileError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'UpgradeFileError'
  }
}

export class UpgradeMinVersionError extends Error {
  constructor(
    message: string,
    public readonly targetVersion: string,
    public readonly minVersion: string,
    public readonly currentVersion: string,
  ) {
    super(message)
    this.name = 'UpgradeMinVersionError'
  }
}

export class UpgradeChainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpgradeChainError'
  }
}
