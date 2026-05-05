/**
 * ApiFrontendStorage — unit tests with a mocked fetch.
 *
 * Exercises:
 * - URL composition (baseUrl + path + query string)
 * - method/body shape per CRUD op
 * - cache hit/miss for find()
 * - cache invalidation + signal emission on mutation
 * - 404 on find returns null instead of throwing
 * - non-2xx errors throw ApiError with status + body
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignalBus, type SignalBus } from '@quazardous/qdcore/signal'
import { ApiError, ApiFrontendStorage } from '../src'

interface MockedCall {
  url: string
  init: RequestInit
}

function makeFetchMock(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
): { fetch: typeof globalThis.fetch; calls: MockedCall[] } {
  const calls: MockedCall[] = []
  const fetchImpl: typeof globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, init })
    return await responder(url, init)
  }
  return { fetch: fetchImpl, calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let signals: SignalBus

beforeEach(() => {
  signals = createSignalBus()
})

afterEach(() => {
  signals.offAll()
})

describe('URL composition', () => {
  it('strips trailing slashes from baseUrl', () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(200, {}))
    const storage = new ApiFrontendStorage({
      baseUrl: '/api/qdcms///',
      signals,
      fetch: f,
    })
    const url = storage.buildUrl('/entity/user')
    expect(url).toBe('/api/qdcms/entity/user')
  })

  it('builds query string from params', () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(200, {}))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const url = storage.buildUrl('/entity/user', { limit: 10, offset: 20 })
    expect(url).toBe('/api/qdcms/entity/user?limit=10&offset=20')
  })

  it('omits undefined / null query params', () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(200, {}))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const url = storage.buildUrl('/entity/user', { limit: 10, offset: undefined, sort: null })
    expect(url).toBe('/api/qdcms/entity/user?limit=10')
  })
})

describe('repository.find', () => {
  it('issues GET to the right URL on cache miss', async () => {
    const { fetch: f, calls } = makeFetchMock(() =>
      jsonResponse(200, { id: 'u1', email: 'a@x.com' }),
    )
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string; email: string }>('user')
    const row = await repo.find('u1')
    expect(row?.email).toBe('a@x.com')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/qdcms/entity/user/u1')
    expect(calls[0].init.method).toBe('GET')
  })

  it('serves from cache on second call (no fetch)', async () => {
    const { fetch: f, calls } = makeFetchMock(() =>
      jsonResponse(200, { id: 'u1', email: 'a@x.com' }),
    )
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string; email: string }>('user')
    await repo.find('u1')
    await repo.find('u1')
    expect(calls).toHaveLength(1)
  })

  it('returns null on 404 instead of throwing', async () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(404, { message: 'gone' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository('user')
    const row = await repo.find('ghost')
    expect(row).toBeNull()
  })

  it('throws ApiError on 500', async () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(500, { message: 'boom' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository('user')
    await expect(repo.find('u1')).rejects.toThrow(ApiError)
  })

  it('encodes special-character ids in the URL', async () => {
    const { fetch: f, calls } = makeFetchMock(() => jsonResponse(200, { id: 'a/b' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository('user')
    await repo.find('a/b')
    expect(calls[0].url).toBe('/api/qdcms/entity/user/a%2Fb')
  })
})

describe('repository.list + count', () => {
  it('issues GET with query params; pre-warms cache from items[]', async () => {
    const { fetch: f, calls } = makeFetchMock(() =>
      jsonResponse(200, {
        total: 3,
        items: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
      }),
    )
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string }>('user')
    const list = await repo.list({ limit: 10, offset: 0 })
    expect(list).toHaveLength(3)
    expect(calls[0].url).toContain('limit=10')
    expect(calls[0].url).toContain('offset=0')
    // After list, find(u1) should hit the cache (no extra fetch).
    const callsBefore = calls.length
    await repo.find('u1')
    expect(calls).toHaveLength(callsBefore)
  })

  it('count returns the total field', async () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(200, { total: 42, items: [] }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository('user')
    const n = await repo.count()
    expect(n).toBe(42)
  })
})

describe('repository.create', () => {
  it('POSTs body and returns server response', async () => {
    const { fetch: f, calls } = makeFetchMock((url, init) => {
      const sent = JSON.parse(init.body as string)
      return jsonResponse(201, { id: 'u1', ...sent })
    })
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string; email: string }>('user')
    const created = await repo.create({ email: 'a@x.com' })
    expect(created.email).toBe('a@x.com')
    expect(created.id).toBe('u1')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'a@x.com' })
  })

  it('emits entity:created signal', async () => {
    const { fetch: f } = makeFetchMock(() => jsonResponse(201, { id: 'u1' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string }>('user')

    const seen: unknown[] = []
    signals.on('entity:created', (e) => {
      seen.push(e.data)
    })

    await repo.create({})
    // Wait a tick for signal dispatch.
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ entity: 'user' })
  })
})

describe('repository.update', () => {
  it('PATCHes body, refreshes cache, emits signal', async () => {
    const { fetch: f, calls } = makeFetchMock((url, init) => {
      const sent = JSON.parse(init.body as string)
      return jsonResponse(200, { id: 'u1', ...sent })
    })
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string; name: string }>('user')

    const seen: unknown[] = []
    signals.on('entity:updated', (e) => {
      seen.push(e.data)
    })

    const updated = await repo.update('u1', { name: 'New' })
    expect(updated.name).toBe('New')
    expect(calls[0].init.method).toBe('PATCH')
    expect(calls[0].url).toBe('/api/qdcms/entity/user/u1')

    // Cached now — find() returns without extra fetch.
    const cachedHit = await repo.find('u1')
    expect(cachedHit?.name).toBe('New')
    expect(calls).toHaveLength(1)

    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toHaveLength(1)
  })
})

describe('repository.delete', () => {
  it('DELETEs, evicts cache, emits signal', async () => {
    const { fetch: f, calls } = makeFetchMock((url, init) => {
      if (init.method === 'GET') return jsonResponse(200, { id: 'u1' })
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      return jsonResponse(500, { message: 'unexpected' })
    })
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string }>('user')

    const seen: unknown[] = []
    signals.on('entity:deleted', (e) => {
      seen.push(e.data)
    })

    // Prime cache
    await repo.find('u1')
    expect(calls).toHaveLength(1)

    await repo.delete('u1')
    expect(calls).toHaveLength(2)
    expect(calls[1].init.method).toBe('DELETE')

    // After delete, find() should refetch (cache evicted) and get 404.
    const f404 = makeFetchMock(() => jsonResponse(404, { message: 'gone' }))
    storage['fetchImpl'] = f404.fetch as unknown as typeof globalThis.fetch
    const after = await repo.find('u1')
    expect(after).toBeNull()

    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toHaveLength(1)
  })
})

describe('explicit invalidate + clear', () => {
  it('invalidate(name, id) drops one cached row', async () => {
    const { fetch: f, calls } = makeFetchMock(() => jsonResponse(200, { id: 'u1' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string }>('user')

    await repo.find('u1')
    expect(calls).toHaveLength(1)
    storage.invalidate('user', 'u1')
    await repo.find('u1')
    expect(calls).toHaveLength(2) // refetched
  })

  it('invalidate(name) without id drops the whole entity cache', async () => {
    const { fetch: f, calls } = makeFetchMock(() => jsonResponse(200, { id: 'u1' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string }>('user')
    await repo.find('u1')
    storage.invalidate('user')
    await repo.find('u1')
    expect(calls).toHaveLength(2)
  })

  it('clear() drops everything', async () => {
    const { fetch: f, calls } = makeFetchMock(() => jsonResponse(200, { id: 'u1' }))
    const storage = new ApiFrontendStorage({ baseUrl: '/api/qdcms', signals, fetch: f })
    const repo = storage.repository<{ id: string }>('user')
    await repo.find('u1')
    storage.clear()
    await repo.find('u1')
    expect(calls).toHaveLength(2)
  })
})

describe('defaultHeaders', () => {
  it('sends default headers on every request', async () => {
    const { fetch: f, calls } = makeFetchMock(() => jsonResponse(200, { id: 'u1' }))
    const storage = new ApiFrontendStorage({
      baseUrl: '/api/qdcms',
      signals,
      fetch: f,
      defaultHeaders: { authorization: 'Bearer xyz' },
    })
    const repo = storage.repository('user')
    await repo.find('u1')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer xyz')
  })
})
