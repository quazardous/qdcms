/**
 * End-to-end test — proves the full chain works browser-side.
 *
 *   ApiFrontendStorage  →  fetch (intercepted)
 *                              ↓
 *                           emulator
 *                              ↓
 *                       backend.handle
 *                              ↓
 *                    MikroORM SQLite (in-process, temp file)
 *                              ↓
 *                  qdcms-plugin-core's tables
 *
 * If this passes, the demo can deploy as a static SPA on GitHub
 * Pages and consume qdcms-frontend exactly as a real app would —
 * with no server.
 */

import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackend, type QdcmsBackend } from '@quazardous/qdcms-backend'
import { ApiFrontendStorage } from '@quazardous/qdcms-frontend'
import { createSignalBus, type SignalBus } from '@quazardous/qdcore/signal'
import { installEmulator, type EmulatorHandle } from '../src'

const here = dirname(fileURLToPath(import.meta.url))
const pluginCoreSrc = resolvePath(here, '../../qdcms-plugin-core')

interface Env {
  hostPath: string
  dbDir: string
  backend: QdcmsBackend
  emulator: EmulatorHandle
  storage: ApiFrontendStorage
  signals: SignalBus
  cleanup(): Promise<void>
}

let originalFetch: typeof globalThis.fetch
let env: Env

beforeEach(async () => {
  originalFetch = globalThis.fetch

  const hostPath = mkdtempSync(join(tmpdir(), 'qdcms-e2e-host-'))
  const nm = join(hostPath, 'node_modules', '@quazardous')
  mkdirSync(nm, { recursive: true })
  symlinkSync(pluginCoreSrc, join(nm, 'qdcms-plugin-core'), 'dir')

  const dbDir = mkdtempSync(join(tmpdir(), 'qdcms-e2e-db-'))
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

  const emulator = installEmulator({ backend })
  const signals = createSignalBus()
  const storage = new ApiFrontendStorage({
    baseUrl: '/api/qdcms',
    signals,
  })

  env = {
    hostPath,
    dbDir,
    backend,
    emulator,
    storage,
    signals,
    async cleanup() {
      emulator.uninstall()
      await backend.shutdown()
      try {
        rmSync(hostPath, { recursive: true, force: true })
        rmSync(dbDir, { recursive: true, force: true })
      } catch {
        // best effort
      }
    },
  }
})

afterEach(async () => {
  if (env) await env.cleanup()
  globalThis.fetch = originalFetch
})

describe('end-to-end: ApiFrontendStorage → emulator → backend → SQLite', () => {
  it('lists plugins (zero-rows entity is fine)', async () => {
    // Sanity check via the GET /plugins route, mediated by the emulator.
    const res = await fetch('/api/qdcms/plugins')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plugins: Array<{ id: string }> }
    expect(body.plugins[0].id).toBe('@quazardous/qdcms-plugin-core')
  })

  it('CRUD a user via ApiFrontendStorage', async () => {
    const repo = env.storage.repository<{
      id: string
      email: string
      name?: string
      created_at: string
      updated_at: string
    }>('user')

    // CREATE
    const created = await repo.create({
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      email: 'alice@example.com',
      name: 'Alice',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(created.email).toBe('alice@example.com')

    // FIND (cached after create)
    const found = await repo.find('aaaaaaaa-1111-2222-3333-444444444444')
    expect(found?.name).toBe('Alice')

    // LIST
    const list = await repo.list({ limit: 10 })
    expect(list).toHaveLength(1)

    // UPDATE
    const updated = await repo.update('aaaaaaaa-1111-2222-3333-444444444444', {
      name: 'Alice the Updated',
    })
    expect(updated.name).toBe('Alice the Updated')

    // DELETE
    await repo.delete('aaaaaaaa-1111-2222-3333-444444444444')
    const gone = await repo.find('aaaaaaaa-1111-2222-3333-444444444444')
    expect(gone).toBeNull()

    // After all the above, the emulator should have routed every
    // qdcms request — count it.
    expect(env.emulator.interceptedCount).toBeGreaterThan(0)
  })

  it('signals fire on mutations through the full chain', async () => {
    const seen: Array<{ name: string; entity?: string }> = []
    env.signals.on('entity:created', (e) => {
      seen.push({ name: e.name, entity: (e.data as { entity?: string }).entity })
    })
    env.signals.on('entity:updated', (e) => {
      seen.push({ name: e.name, entity: (e.data as { entity?: string }).entity })
    })
    env.signals.on('entity:deleted', (e) => {
      seen.push({ name: e.name, entity: (e.data as { entity?: string }).entity })
    })

    const repo = env.storage.repository<{
      id: string
      email: string
      created_at: string
      updated_at: string
    }>('user')
    await repo.create({
      id: 'sig-1',
      email: 'sig@x.com',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    })
    await repo.update('sig-1', { email: 'sig2@x.com' })
    await repo.delete('sig-1')

    // Wait a tick for async signal dispatch.
    await new Promise((r) => setTimeout(r, 10))

    expect(seen.map((s) => s.name)).toEqual([
      'entity:created',
      'entity:updated',
      'entity:deleted',
    ])
    for (const ev of seen) {
      expect(ev.entity).toBe('user')
    }
  })

  it('non-qdcms URLs fall through to the original fetch (no interference)', async () => {
    // We don't have a real network, but we can verify the proxy
    // doesn't try to handle a non-matching URL by counting that
    // interceptedCount stays 0 for the non-matching path.
    const before = env.emulator.interceptedCount
    try {
      await fetch('https://example.invalid/something')
    } catch {
      // network error expected — the point is the emulator didn't claim it
    }
    expect(env.emulator.interceptedCount).toBe(before)
  })
})
