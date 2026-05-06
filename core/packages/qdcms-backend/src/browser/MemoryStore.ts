/**
 * MemoryStore — pure-JS row store backing the in-browser qdcms-backend.
 *
 * Shape: `Record<tableName, Record<id, Row>>`. JSON-serialisable so
 * we can dump it into Web Storage on every mutation and restore it
 * at construction. No SQL, no ORM, no driver — that's the point.
 *
 * This is the storage half of the in-browser bridge. The HTTP
 * handlers in `routes.ts` translate qdcms-contract requests into
 * calls on this object.
 */

import type { BrowserPlugin, CreateBrowserBackendOptions } from './types'

export type Row = Record<string, unknown>
export type Table = Record<string, Row>
export type Snapshot = Record<string, Table>

const DEFAULT_STORAGE_KEY = 'qdcms-browser-backend'

export class MemoryStore {
  private data: Snapshot
  private readonly persist: CreateBrowserBackendOptions['persist']
  private readonly storageKey: string
  private readonly tableByLogicalName: Map<string, string>

  constructor(opts: CreateBrowserBackendOptions) {
    this.persist = opts.persist ?? 'localStorage'
    this.storageKey = opts.storageKey ?? DEFAULT_STORAGE_KEY
    this.tableByLogicalName = buildTableNameIndex(opts.plugins)

    this.data = this.load() ?? this.seed(opts)
  }

  // ─── Public API used by the routes ─────────────────────────────────────

  hasEntity(logicalName: string): boolean {
    return this.tableByLogicalName.has(logicalName)
  }

  list(
    logicalName: string,
    opts: { limit?: number; offset?: number },
  ): { items: Row[]; total: number } {
    const table = this.tableFor(logicalName)
    const all = Object.values(this.data[table] ?? {})
    const limit = opts.limit ?? all.length
    const offset = opts.offset ?? 0
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    }
  }

  get(logicalName: string, id: string | number): Row | null {
    const table = this.tableFor(logicalName)
    return this.data[table]?.[String(id)] ?? null
  }

  insert(logicalName: string, row: Row): Row {
    const table = this.tableFor(logicalName)
    const id = row.id
    if (id === undefined || id === null) {
      throw new Error(
        `qdcms-backend/browser: cannot insert into "${logicalName}" without an "id" field`,
      )
    }
    this.data[table] ??= {}
    this.data[table][String(id)] = { ...row }
    this.save()
    return this.data[table][String(id)]
  }

  update(logicalName: string, id: string | number, partial: Row): Row | null {
    const table = this.tableFor(logicalName)
    const existing = this.data[table]?.[String(id)]
    if (!existing) return null
    const merged = { ...existing, ...partial, id }
    this.data[table][String(id)] = merged
    this.save()
    return merged
  }

  delete(logicalName: string, id: string | number): boolean {
    const table = this.tableFor(logicalName)
    if (!this.data[table]?.[String(id)]) return false
    delete this.data[table][String(id)]
    this.save()
    return true
  }

  /** Wipe the persisted snapshot — used by "reset" buttons in demos. */
  reset(): void {
    if (this.persist === 'none') {
      this.data = {}
      return
    }
    const ws = this.persist === 'sessionStorage' ? globalThis.sessionStorage : globalThis.localStorage
    try {
      ws?.removeItem(this.storageKey)
    } catch {
      /* ignore */
    }
    this.data = {}
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private tableFor(logicalName: string): string {
    const t = this.tableByLogicalName.get(logicalName)
    if (!t) {
      throw new Error(`qdcms-backend/browser: unknown entity "${logicalName}"`)
    }
    return t
  }

  private load(): Snapshot | null {
    if (this.persist === 'none') return null
    const ws = this.persist === 'sessionStorage' ? globalThis.sessionStorage : globalThis.localStorage
    if (!ws) return null
    const raw = ws.getItem(this.storageKey)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Snapshot
    } catch {
      // Corrupted entry — drop it.
      return null
    }
  }

  private save(): void {
    if (this.persist === 'none') return
    const ws = this.persist === 'sessionStorage' ? globalThis.sessionStorage : globalThis.localStorage
    if (!ws) return
    try {
      ws.setItem(this.storageKey, JSON.stringify(this.data))
    } catch {
      // Quota exceeded or storage unavailable — silently ignore.
      // The runtime carries on with in-memory state.
    }
  }

  private seed(opts: CreateBrowserBackendOptions): Snapshot {
    const out: Snapshot = {}
    for (const [logicalName, rows] of Object.entries(opts.seed ?? {})) {
      const table = this.tableByLogicalName.get(logicalName)
      if (!table) continue // ignore seeds for unknown entities
      out[table] ??= {}
      for (const raw of rows) {
        if (!raw || typeof raw !== 'object') {
          throw new Error(
            `qdcms-backend/browser: seed for "${logicalName}" must contain objects`,
          )
        }
        const row = raw as Row & { id?: unknown }
        if (typeof row.id !== 'string' && typeof row.id !== 'number') {
          throw new Error(
            `qdcms-backend/browser: seed for "${logicalName}" has a row without a string/number "id" field`,
          )
        }
        out[table][String(row.id)] = { ...row }
      }
    }
    if (this.persist !== 'none') {
      // Persist the seed snapshot so it's there for the user's first
      // mutation — avoids "seed → mutate → save → reload finds only
      // the mutated row" (which would lose the un-seeded rows).
      const ws = this.persist === 'sessionStorage' ? globalThis.sessionStorage : globalThis.localStorage
      try {
        ws?.setItem(this.storageKey, JSON.stringify(out))
      } catch {
        /* ignore */
      }
    }
    return out
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildTableNameIndex(plugins: BrowserPlugin[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const p of plugins) {
    for (const logicalName of p.tables) {
      const physical = logicalName.startsWith(`${p.prefix}_`)
        ? logicalName
        : `${p.prefix}_${logicalName}`
      index.set(logicalName, physical)
    }
  }
  return index
}
