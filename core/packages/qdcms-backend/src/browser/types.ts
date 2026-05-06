/**
 * Types for the in-browser flavour of qdcms-backend.
 *
 * This is the bare-bones counterpart to the Node `createBackend` —
 * same HTTP contract, no MikroORM, no node_modules loader. Plugins
 * and seed data are passed in directly by the caller.
 */

export interface BrowserPlugin {
  /** Plugin id (matches what `/plugins` returns). */
  id: string
  /** Plugin version (advisory). */
  version: string
  /** Prefix used for table names: `<prefix>_<entityName>`. */
  prefix: string
  /** Optional human-friendly title surfaced by `/plugins`. */
  title?: string
  /**
   * Logical entity names this plugin owns. Physical table name is
   * derived as `<prefix>_<name>` (idempotent if the caller already
   * includes the prefix).
   */
  tables: string[]
}

/**
 * Initial rows per logical entity name. Each row MUST carry an `id`
 * field (the store uses it as the primary key) — checked at seed time.
 *
 * Typed as `unknown[]` to accept any user-defined row shape without
 * TypeScript index-signature compatibility headaches.
 */
export type BrowserSeed = Record<string, ReadonlyArray<unknown>>

export interface CreateBrowserBackendOptions {
  plugins: BrowserPlugin[]
  /** Initial rows, keyed by logical entity name. */
  seed?: BrowserSeed
  /**
   * Persistence strategy for the in-memory store.
   *   'localStorage'   — survives reloads + browser restarts (default)
   *   'sessionStorage' — survives reloads, dies on tab close
   *   'none'           — pure JS heap, dies on reload
   */
  persist?: 'localStorage' | 'sessionStorage' | 'none'
  /** Key under which the snapshot is stored. Default: 'qdcms-browser-backend'. */
  storageKey?: string
}
