/**
 * HTTP API tests — direct calls to QdcmsBackend.handle().
 *
 * Spins up a real backend with qdcms-plugin-core discovered + installed,
 * exercises every route, asserts status + body shape.
 */

import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackend, type QdcmsBackend } from '../src'

const here = dirname(fileURLToPath(import.meta.url))
const pluginCoreSrc = resolvePath(here, '../../qdcms-plugin-core')

interface Env {
  hostPath: string
  dbDir: string
  backend: QdcmsBackend
  cleanup(): Promise<void>
}

async function bootEnv(): Promise<Env> {
  const hostPath = mkdtempSync(join(tmpdir(), 'qdcms-http-host-'))
  const nm = join(hostPath, 'node_modules', '@quazardous')
  mkdirSync(nm, { recursive: true })
  symlinkSync(pluginCoreSrc, join(nm, 'qdcms-plugin-core'), 'dir')

  const dbDir = mkdtempSync(join(tmpdir(), 'qdcms-http-db-'))
  const dbPath = join(dbDir, 'test.sqlite')

  const backend = await createBackend({
    hostPath,
    ormOptions: {
      driver: (await import('@mikro-orm/sqlite')).SqliteDriver,
      dbName: dbPath,
      debug: false,
      allowGlobalContext: true,
    },
  })

  return {
    hostPath,
    dbDir,
    backend,
    async cleanup() {
      await backend.shutdown()
      try {
        rmSync(hostPath, { recursive: true, force: true })
        rmSync(dbDir, { recursive: true, force: true })
      } catch {
        // best effort
      }
    },
  }
}

let env: Env

beforeEach(async () => {
  env = await bootEnv()
})

afterEach(async () => {
  await env.cleanup()
})

// ─── /plugins ────────────────────────────────────────────────────────────

describe('GET /plugins', () => {
  it('lists registered plugins with state', async () => {
    const res = await env.backend.handle({ method: 'GET', path: '/plugins' })
    expect(res.status).toBe(200)
    const body = res.body as { plugins: Array<{ id: string; state: string }> }
    expect(body.plugins).toHaveLength(1)
    expect(body.plugins[0].id).toBe('@quazardous/qdcms-plugin-core')
    expect(body.plugins[0].state).toBe('installed')
  })
})

// ─── /entity/:name ───────────────────────────────────────────────────────

describe('POST + GET + LIST /entity/user', () => {
  it('POST creates a user; GET retrieves it; LIST returns it', async () => {
    const userId = 'aaaaaaaa-1111-1111-1111-111111111111'

    // POST
    const post = await env.backend.handle({
      method: 'POST',
      path: '/entity/user',
      body: {
        id: userId,
        email: 'alice@example.com',
        name: 'Alice',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
    expect(post.status).toBe(201)

    // GET single
    const get = await env.backend.handle({
      method: 'GET',
      path: `/entity/user/${userId}`,
    })
    expect(get.status).toBe(200)
    expect((get.body as { email: string }).email).toBe('alice@example.com')

    // LIST
    const list = await env.backend.handle({
      method: 'GET',
      path: '/entity/user',
    })
    expect(list.status).toBe(200)
    const lb = list.body as { total: number; items: Array<{ email: string }> }
    expect(lb.total).toBe(1)
    expect(lb.items[0].email).toBe('alice@example.com')
  })

  it('LIST honours ?limit + ?offset', async () => {
    for (let i = 0; i < 5; i++) {
      await env.backend.handle({
        method: 'POST',
        path: '/entity/user',
        body: {
          id: `id-${i}`,
          email: `u${i}@x.com`,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      })
    }
    const res = await env.backend.handle({
      method: 'GET',
      path: '/entity/user',
      query: { limit: '2', offset: '1' },
    })
    expect(res.status).toBe(200)
    const body = res.body as { total: number; limit: number; offset: number; items: unknown[] }
    expect(body.total).toBe(5)
    expect(body.limit).toBe(2)
    expect(body.offset).toBe(1)
    expect(body.items).toHaveLength(2)
  })

  it('GET unknown id returns 404', async () => {
    const res = await env.backend.handle({
      method: 'GET',
      path: '/entity/user/ghost',
    })
    expect(res.status).toBe(404)
  })

  it('LIST unknown entity returns 404', async () => {
    const res = await env.backend.handle({
      method: 'GET',
      path: '/entity/ghostentity',
    })
    expect(res.status).toBe(404)
  })

  it('POST unknown entity returns 404', async () => {
    const res = await env.backend.handle({
      method: 'POST',
      path: '/entity/ghostentity',
      body: { x: 1 },
    })
    expect(res.status).toBe(404)
  })

  it('POST without body returns 400', async () => {
    const res = await env.backend.handle({
      method: 'POST',
      path: '/entity/user',
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /entity/user/:id', () => {
  it('updates a user and returns the new row', async () => {
    const userId = 'patch-test'
    await env.backend.handle({
      method: 'POST',
      path: '/entity/user',
      body: { id: userId, email: 'before@x.com', created_at: '2026-01-01', updated_at: '2026-01-01' },
    })
    const patch = await env.backend.handle({
      method: 'PATCH',
      path: `/entity/user/${userId}`,
      body: { name: 'Updated', email: 'after@x.com' },
    })
    expect(patch.status).toBe(200)
    const row = patch.body as { name: string; email: string }
    expect(row.name).toBe('Updated')
    expect(row.email).toBe('after@x.com')
  })

  it('rejects payload with no updatable columns', async () => {
    const userId = 'patch-empty'
    await env.backend.handle({
      method: 'POST',
      path: '/entity/user',
      body: { id: userId, email: 'x@x.com', created_at: '2026-01-01', updated_at: '2026-01-01' },
    })
    const patch = await env.backend.handle({
      method: 'PATCH',
      path: `/entity/user/${userId}`,
      body: { id: 'tries-to-rename-itself' },
    })
    expect(patch.status).toBe(400)
  })
})

describe('DELETE /entity/user/:id', () => {
  it('removes a user; subsequent GET returns 404', async () => {
    const userId = 'del-test'
    await env.backend.handle({
      method: 'POST',
      path: '/entity/user',
      body: { id: userId, email: 'd@x.com', created_at: '2026-01-01', updated_at: '2026-01-01' },
    })
    const del = await env.backend.handle({
      method: 'DELETE',
      path: `/entity/user/${userId}`,
    })
    expect(del.status).toBe(204)
    const get = await env.backend.handle({
      method: 'GET',
      path: `/entity/user/${userId}`,
    })
    expect(get.status).toBe(404)
  })
})

// ─── /schema-state ───────────────────────────────────────────────────────

describe('GET /schema-state', () => {
  it('returns applied rows for every plugin', async () => {
    const res = await env.backend.handle({ method: 'GET', path: '/schema-state' })
    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown[]>
    expect(body['@quazardous/qdcms-plugin-core']).toBeDefined()
    expect(body['@quazardous/qdcms-plugin-core']).toHaveLength(1)
  })
})

describe('GET /schema-state/:plugin', () => {
  it('returns applied rows for one plugin', async () => {
    const res = await env.backend.handle({
      method: 'GET',
      path: '/schema-state/@quazardous/qdcms-plugin-core',
    })
    // Note: the plugin name contains a `/` which the path router treats
    // as a segment separator. The :plugin pattern matches one segment,
    // so the URL needs to be encoded. Test the encoded form.
    if (res.status === 404) {
      // Try URL-encoded
      const enc = encodeURIComponent('@quazardous/qdcms-plugin-core')
      const res2 = await env.backend.handle({
        method: 'GET',
        path: `/schema-state/${enc}`,
      })
      expect(res2.status).toBe(200)
      expect(res2.body).toHaveLength(1)
    } else {
      expect(res.status).toBe(200)
    }
  })

  it('unknown plugin returns 404', async () => {
    const res = await env.backend.handle({
      method: 'GET',
      path: '/schema-state/ghost',
    })
    expect(res.status).toBe(404)
  })
})

// ─── Routing edge cases ──────────────────────────────────────────────────

describe('routing edge cases', () => {
  it('unknown path returns 404', async () => {
    const res = await env.backend.handle({ method: 'GET', path: '/nope' })
    expect(res.status).toBe(404)
  })

  it('known path with wrong method returns 405', async () => {
    const res = await env.backend.handle({ method: 'POST', path: '/plugins' })
    expect(res.status).toBe(405)
  })

  it('malformed path returns 400', async () => {
    const res = await env.backend.handle({
      method: 'GET',
      path: 'plugins' as unknown as string,
    })
    expect(res.status).toBe(400)
  })
})
