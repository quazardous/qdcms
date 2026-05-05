/**
 * installEmulator — unit tests with a fake backend handle.
 *
 * Each test installs+uninstalls in its own scope to avoid leaking
 * the patched fetch between tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  QdcmsRequest,
  QdcmsResponse,
} from '@quazardous/qdcms-backend/http'
import { installEmulator, type EmulatorHandle } from '../src'

interface CapturedCall {
  req: QdcmsRequest
}

function makeFakeBackend(
  responder: (req: QdcmsRequest) => QdcmsResponse | Promise<QdcmsResponse>,
): {
  backend: { handle(req: QdcmsRequest): Promise<QdcmsResponse> }
  calls: CapturedCall[]
} {
  const calls: CapturedCall[] = []
  return {
    backend: {
      async handle(req) {
        calls.push({ req })
        return await responder(req)
      },
    },
    calls,
  }
}

let originalFetch: typeof globalThis.fetch
let handle: EmulatorHandle | null

beforeEach(() => {
  originalFetch = globalThis.fetch
  handle = null
})

afterEach(() => {
  if (handle) handle.uninstall()
  globalThis.fetch = originalFetch
})

describe('URL matching', () => {
  it('routes /api/qdcms/* requests to backend.handle', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: { ok: true } }))
    handle = installEmulator({ backend })

    const res = await fetch('/api/qdcms/plugins')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].req.method).toBe('GET')
    expect(calls[0].req.path).toBe('/plugins')
  })

  it('falls through to original fetch for non-matched URLs', async () => {
    const fallback = vi.fn(async () => new Response('fallback', { status: 200 }))
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend, fallback })

    const res = await fetch('/some/other/path')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('fallback')
    expect(fallback).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(0)
  })

  it('strips the basePath prefix from the path passed to the backend', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/entity/user/abc-123')
    expect(calls[0].req.path).toBe('/entity/user/abc-123')
  })

  it('honours custom basePath', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend, basePath: '/custom-api' })

    await fetch('/custom-api/plugins')
    expect(calls).toHaveLength(1)
    expect(calls[0].req.path).toBe('/plugins')
  })

  it('matches absolute URLs by default (matchAbsolute: true)', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('https://example.com/api/qdcms/plugins')
    expect(calls).toHaveLength(1)
  })

  it('matchAbsolute: false skips absolute URLs', async () => {
    const fallback = vi.fn(async () => new Response('passthrough', { status: 200 }))
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend, fallback, matchAbsolute: false })

    const res = await fetch('https://example.com/api/qdcms/plugins')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('passthrough')
    expect(fallback).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(0)
  })
})

describe('Request shape extraction', () => {
  it('extracts query parameters as a record', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/entity/user?limit=10&offset=20')
    expect(calls[0].req.query).toEqual({ limit: '10', offset: '20' })
  })

  it('multi-value query keys yield arrays', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/entity/user?tag=a&tag=b')
    expect(calls[0].req.query).toEqual({ tag: ['a', 'b'] })
  })

  it('parses JSON body for POST', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 201, body: { id: 'u1' } }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/entity/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@x.com' }),
    })
    expect(calls[0].req.body).toEqual({ email: 'a@x.com' })
  })

  it('forwards headers in lowercase', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/plugins', {
      headers: { Authorization: 'Bearer xyz', 'X-Custom': 'foo' },
    })
    expect(calls[0].req.headers?.authorization).toBe('Bearer xyz')
    expect(calls[0].req.headers?.['x-custom']).toBe('foo')
  })

  it('captures method correctly for PATCH', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/entity/user/u1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New' }),
    })
    expect(calls[0].req.method).toBe('PATCH')
  })

  it('handles DELETE without body', async () => {
    const { backend, calls } = makeFakeBackend(() => ({ status: 204, body: null }))
    handle = installEmulator({ backend })

    const res = await fetch('/api/qdcms/entity/user/u1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(calls[0].req.method).toBe('DELETE')
    expect(calls[0].req.body).toBeUndefined()
  })
})

describe('Response shape conversion', () => {
  it('converts QdcmsResponse to a fetch Response with JSON body', async () => {
    const { backend } = makeFakeBackend(() => ({
      status: 201,
      body: { id: 'u1', email: 'a@x.com' },
    }))
    handle = installEmulator({ backend })

    const res = await fetch('/api/qdcms/entity/user', { method: 'POST' })
    expect(res.status).toBe(201)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ id: 'u1', email: 'a@x.com' })
  })

  it('204 → empty response body', async () => {
    const { backend } = makeFakeBackend(() => ({ status: 204, body: null }))
    handle = installEmulator({ backend })

    const res = await fetch('/api/qdcms/entity/user/u1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('thrown errors in handle become 500', async () => {
    const { backend } = makeFakeBackend(() => {
      throw new Error('handler exploded')
    })
    handle = installEmulator({ backend })

    const res = await fetch('/api/qdcms/plugins')
    expect(res.status).toBe(500)
    const body = (await res.json()) as { message: string }
    expect(body.message).toContain('handler exploded')
  })

  it('forwards backend response headers', async () => {
    const { backend } = makeFakeBackend(() => ({
      status: 200,
      body: { ok: true },
      headers: { 'x-rate-limit': '99' },
    }))
    handle = installEmulator({ backend })

    const res = await fetch('/api/qdcms/plugins')
    expect(res.headers.get('x-rate-limit')).toBe('99')
  })
})

describe('uninstall', () => {
  it('restores the original fetch reference', async () => {
    const { backend } = makeFakeBackend(() => ({ status: 200, body: {} }))
    const original = globalThis.fetch
    handle = installEmulator({ backend })
    expect(globalThis.fetch).not.toBe(original)
    handle.uninstall()
    expect(globalThis.fetch).toBe(original)
    handle = null // already uninstalled, don't double in afterEach
  })

  it('interceptedCount tracks calls routed through the proxy', async () => {
    const { backend } = makeFakeBackend(() => ({ status: 200, body: {} }))
    handle = installEmulator({ backend })

    await fetch('/api/qdcms/plugins')
    await fetch('/api/qdcms/plugins')
    await fetch('/some/other/path').catch(() => null)

    expect(handle.interceptedCount).toBe(2)
  })
})
