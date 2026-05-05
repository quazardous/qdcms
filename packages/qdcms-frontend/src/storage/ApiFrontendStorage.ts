/**
 * ApiFrontendStorage — implements `FrontendStorage` from qdcms-core
 * by talking to the qdcms-backend HTTP API via fetch.
 *
 * Layout (matches qdcms-backend route shapes):
 *   GET    {baseUrl}/entity/:name?limit=&offset=
 *   GET    {baseUrl}/entity/:name/:id
 *   POST   {baseUrl}/entity/:name
 *   PATCH  {baseUrl}/entity/:name/:id
 *   DELETE {baseUrl}/entity/:name/:id
 *
 * Cache strategy
 *   - per-entity Map keyed by id (find() hits cache first, list() always
 *     refetches because filtering parameters vary)
 *   - mutations (create/update/delete) invalidate the entity's cache and
 *     emit a SignalBus event the host can subscribe to
 *   - explicit invalidate(name, id?) and clear() expose manual control
 *
 * Errors
 *   - non-2xx responses throw `ApiError` with status + response body
 *   - the host wraps Vue composable calls with try/catch (`useEntity`,
 *     `useCollection`)
 */

import {
  buildSignal,
  SIGNAL_ACTIONS,
  type SignalBus,
} from '@quazardous/qdcore/signal'
import type {
  FrontendStorage,
  Query,
  Repository,
} from '@quazardous/qdcms-core/entity'

export interface ApiFrontendStorageOptions {
  /**
   * Absolute base URL of the qdcms HTTP API. Trailing slash trimmed.
   * Examples: `'/api/qdcms'` (same-origin), `'https://api.example.com/api/qdcms'`.
   */
  baseUrl: string
  /**
   * SignalBus instance the storage emits invalidation signals on.
   * Same instance the host (qdcms `createCms`) uses, so subscribers
   * can react to entity changes.
   */
  signals: SignalBus
  /**
   * Optional fetch implementation override. Default: `globalThis.fetch`.
   * Tests inject a stub; the future qdcms-api-emulator may swap globally.
   */
  fetch?: typeof globalThis.fetch
  /**
   * Optional headers added to every request. Useful for auth tokens.
   * If you need per-request headers, override `fetch` instead.
   */
  defaultHeaders?: Record<string, string>
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface CacheEntry<T> {
  byId: Map<string | number, T>
}

export class ApiFrontendStorage implements FrontendStorage {
  private baseUrl: string
  private signals: SignalBus
  private fetchImpl: typeof globalThis.fetch
  private defaultHeaders: Record<string, string>
  private cache = new Map<string, CacheEntry<unknown>>()

  constructor(options: ApiFrontendStorageOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.signals = options.signals
    // When no fetch override is provided, dispatch through
    // `globalThis.fetch` AT CALL TIME — not at construction time.
    // This matters because consumers commonly install fetch
    // monkey-patches (e.g. qdcms-api-emulator) AFTER apiStorage is
    // already constructed at module-load. Binding here would freeze
    // the original native fetch and silently bypass any later
    // interceptor; deferring the lookup keeps the storage agnostic.
    this.fetchImpl =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.defaultHeaders = options.defaultHeaders ?? {}
  }

  repository<T>(entityName: string): Repository<T> {
    return new ApiRepository<T>(this, entityName)
  }

  invalidate(entityName: string, id?: string | number): void {
    const cache = this.cache.get(entityName)
    if (!cache) return
    if (id === undefined) {
      cache.byId.clear()
    } else {
      cache.byId.delete(id)
    }
  }

  clear(): void {
    this.cache.clear()
  }

  // ─── Internal helpers (called by ApiRepository) ────────────────────────

  /** Cached row lookup; returns undefined on cache miss. */
  cacheGet<T>(entityName: string, id: string | number): T | undefined {
    return this.cache.get(entityName)?.byId.get(id) as T | undefined
  }

  /** Insert/update a row in the cache. */
  cacheSet<T>(entityName: string, id: string | number, row: T): void {
    let cache = this.cache.get(entityName)
    if (!cache) {
      cache = { byId: new Map() }
      this.cache.set(entityName, cache)
    }
    cache.byId.set(id, row as unknown)
  }

  /** Drop a single id from the cache (used after delete). */
  cacheEvict(entityName: string, id: string | number): void {
    this.cache.get(entityName)?.byId.delete(id)
  }

  /** Emit `entity:<action>` signals — same convention as qdcore's emitEntity. */
  async emitEntitySignal(
    entityName: string,
    action: 'created' | 'updated' | 'deleted',
    data: unknown,
  ): Promise<void> {
    await this.signals.emit(buildSignal('entity', action), {
      entity: entityName,
      data,
    })
  }

  // ─── HTTP plumbing ─────────────────────────────────────────────────────

  buildUrl(path: string, query?: Record<string, unknown>): string {
    const base = this.baseUrl + (path.startsWith('/') ? path : '/' + path)
    if (!query) return base
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      params.append(k, String(v))
    }
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  async request<R>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<R> {
    const init: RequestInit = {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...this.defaultHeaders,
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const response = await this.fetchImpl(url, init)
    if (response.status === 204) return null as unknown as R
    let parsed: unknown = null
    const text = await response.text()
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }
    if (!response.ok) {
      const message =
        parsed && typeof parsed === 'object' && 'message' in (parsed as Record<string, unknown>)
          ? String((parsed as Record<string, unknown>).message)
          : `HTTP ${response.status} ${method} ${url}`
      throw new ApiError(response.status, parsed, message)
    }
    return parsed as R
  }
}

// ─── Repository<T> implementation ────────────────────────────────────────

class ApiRepository<T> implements Repository<T> {
  constructor(
    private storage: ApiFrontendStorage,
    private entityName: string,
  ) {}

  async find(id: string | number): Promise<T | null> {
    const cached = this.storage.cacheGet<T>(this.entityName, id)
    if (cached !== undefined) return cached
    const url = this.storage.buildUrl(`/entity/${this.entityName}/${encodeURIComponent(String(id))}`)
    try {
      const row = await this.storage.request<T>('GET', url)
      if (row) this.storage.cacheSet(this.entityName, id, row)
      return row ?? null
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return null
      throw cause
    }
  }

  async list(query?: Query<T>): Promise<T[]> {
    const url = this.storage.buildUrl(`/entity/${this.entityName}`, {
      limit: query?.limit,
      offset: query?.offset,
    })
    const result = await this.storage.request<{ items: T[] }>('GET', url)
    // Pre-warm the cache for items that have an `id` field.
    for (const item of result.items ?? []) {
      const maybeId = (item as unknown as { id?: string | number }).id
      if (maybeId !== undefined) {
        this.storage.cacheSet(this.entityName, maybeId, item)
      }
    }
    return result.items ?? []
  }

  async count(query?: Query<T>): Promise<number> {
    // Use the list endpoint with limit=0 — backend returns the total
    // separately from items.
    const url = this.storage.buildUrl(`/entity/${this.entityName}`, {
      limit: 0,
      offset: query?.offset,
    })
    const result = await this.storage.request<{ total: number }>('GET', url)
    return result.total ?? 0
  }

  async create(data: Partial<T>): Promise<T> {
    const url = this.storage.buildUrl(`/entity/${this.entityName}`)
    const created = await this.storage.request<T>('POST', url, data)
    const id = (created as unknown as { id?: string | number }).id
    if (id !== undefined) this.storage.cacheSet(this.entityName, id, created)
    await this.storage.emitEntitySignal(this.entityName, SIGNAL_ACTIONS.CREATED, created)
    return created
  }

  async update(id: string | number, data: Partial<T>): Promise<T> {
    const url = this.storage.buildUrl(`/entity/${this.entityName}/${encodeURIComponent(String(id))}`)
    const updated = await this.storage.request<T>('PATCH', url, data)
    this.storage.cacheSet(this.entityName, id, updated)
    await this.storage.emitEntitySignal(this.entityName, SIGNAL_ACTIONS.UPDATED, updated)
    return updated
  }

  async delete(id: string | number): Promise<void> {
    const url = this.storage.buildUrl(`/entity/${this.entityName}/${encodeURIComponent(String(id))}`)
    await this.storage.request<null>('DELETE', url)
    this.storage.cacheEvict(this.entityName, id)
    await this.storage.emitEntitySignal(this.entityName, SIGNAL_ACTIONS.DELETED, { id })
  }
}
