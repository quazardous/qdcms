/**
 * Internal types for the demo-backend.
 *
 * This is a DEMO-ONLY mock. It honours the qdcms HTTP contract just
 * enough for blocks to use ApiFrontendStorage as if a real server
 * existed. It does NOT simulate plugin lifecycle, migrations, or
 * schema state. "Barely more sophisticated than a set cookie."
 */

export interface DemoPlugin {
  /** Plugin id (matches what /plugins returns). */
  id: string
  /** Plugin version (advisory only — no semver checks here). */
  version: string
  /** Prefix used for table names: `<prefix>_<entityName>`. */
  prefix: string
  /** Optional human-friendly title surfaced in /plugins. */
  title?: string
  /**
   * Logical entity names this plugin owns. The mock derives the
   * physical table name as `<prefix>_<name>` (idempotent if the
   * caller already includes the prefix).
   */
  tables: string[]
}

/**
 * Initial data per logical entity name. Each row is a flat object;
 * an `id` field is required (the mock uses it as the primary key).
 */
export type DemoSeed = Record<string, Array<{ id: string | number; [k: string]: unknown }>>

export interface CreateDemoBackendOptions {
  plugins: DemoPlugin[]
  /** Initial rows. Keys are logical entity names. */
  seed?: DemoSeed
  /**
   * 'localStorage' — survives reloads and browser restarts (default)
   * 'sessionStorage' — survives reloads, dies on tab close
   * 'none' — pure JS heap, dies on reload
   */
  persist?: 'localStorage' | 'sessionStorage' | 'none'
  /** Key under which the snapshot is stored. Default: 'qdcms-demo-backend'. */
  storageKey?: string
}
