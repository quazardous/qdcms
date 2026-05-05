/**
 * In-browser HTTP dispatcher for the qdcms contract.
 *
 * Bare-bones counterpart to `src/http/router.ts` (the Node, MikroORM-
 * backed version). Same routes — `/plugins`, `/schema-state`,
 * `/entity/:name`, `/entity/:name/:id` — but resolved against the
 * `MemoryStore` instead of a SQL connection. No router class, no
 * MikroORM, no Node deps.
 */

import type { QdcmsRequest, QdcmsResponse } from '../http/index'
import type { MemoryStore, Row } from './MemoryStore'
import type { BrowserPlugin } from './types'

export interface BrowserRouteContext {
  store: MemoryStore
  plugins: BrowserPlugin[]
}

export async function dispatchBrowser(
  req: QdcmsRequest,
  ctx: BrowserRouteContext,
): Promise<QdcmsResponse> {
  // GET /plugins
  if (req.method === 'GET' && req.path === '/plugins') {
    return {
      status: 200,
      body: {
        plugins: ctx.plugins.map((p) => ({
          id: p.id,
          version: p.version,
          prefix: p.prefix,
          title: p.title,
          state: 'installed',
        })),
      },
    }
  }

  // GET /schema-state — bare bones (browser variant doesn't run migrations)
  if (req.method === 'GET' && req.path === '/schema-state') {
    return { status: 200, body: {} }
  }

  // GET /schema-state/:plugin — empty array
  const schemaStateMatch = matchSegments(req.path, ['', 'schema-state', '*'])
  if (req.method === 'GET' && schemaStateMatch) {
    return { status: 200, body: [] }
  }

  // /entity/:name (list + create)
  const entityListMatch = matchSegments(req.path, ['', 'entity', '*'])
  if (entityListMatch) {
    const entityName = entityListMatch[2]
    if (!ctx.store.hasEntity(entityName)) {
      return notFound(`entity "${entityName}" not found`)
    }
    if (req.method === 'GET') {
      const limit = intQuery(req.query, 'limit', 100)
      const offset = intQuery(req.query, 'offset', 0)
      const { items, total } = ctx.store.list(entityName, { limit, offset })
      return {
        status: 200,
        body: { entity: entityName, total, limit, offset, items },
      }
    }
    if (req.method === 'POST') {
      if (!isObjectBody(req.body)) {
        return badRequest('POST /entity/:name requires an object body')
      }
      try {
        const inserted = ctx.store.insert(entityName, req.body as Row)
        return { status: 201, body: inserted }
      } catch (e) {
        return badRequest((e as Error).message)
      }
    }
    return methodNotAllowed(req.method, req.path)
  }

  // /entity/:name/:id (get + patch + delete)
  const entityRowMatch = matchSegments(req.path, ['', 'entity', '*', '*'])
  if (entityRowMatch) {
    const entityName = entityRowMatch[2]
    const id = decodeURIComponent(entityRowMatch[3])
    if (!ctx.store.hasEntity(entityName)) {
      return notFound(`entity "${entityName}" not found`)
    }
    if (req.method === 'GET') {
      const row = ctx.store.get(entityName, id)
      if (!row) return notFound(`${entityName} ${id} not found`)
      return { status: 200, body: row }
    }
    if (req.method === 'PATCH') {
      if (!isObjectBody(req.body)) {
        return badRequest('PATCH requires an object body')
      }
      const updated = ctx.store.update(entityName, id, req.body as Row)
      if (!updated) return notFound(`${entityName} ${id} not found`)
      return { status: 200, body: updated }
    }
    if (req.method === 'DELETE') {
      ctx.store.delete(entityName, id)
      return { status: 204, body: null }
    }
    return methodNotAllowed(req.method, req.path)
  }

  return notFound(`unknown route ${req.method} ${req.path}`)
}

// ─── helpers ──────────────────────────────────────────────────────────────

function matchSegments(path: string, pattern: string[]): string[] | null {
  const segs = path.split('/')
  if (segs.length !== pattern.length) return null
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '*' && pattern[i] !== segs[i]) return null
  }
  return segs
}

function intQuery(
  query: QdcmsRequest['query'],
  key: string,
  fallback: number,
): number {
  const raw = query?.[key]
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = Number(v)
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback
}

function isObjectBody(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
}

function notFound(message: string): QdcmsResponse {
  return { status: 404, body: { error: 'NOT_FOUND', message } }
}

function badRequest(message: string): QdcmsResponse {
  return { status: 400, body: { error: 'BAD_REQUEST', message } }
}

function methodNotAllowed(method: string, path: string): QdcmsResponse {
  return {
    status: 405,
    body: { error: 'METHOD_NOT_ALLOWED', message: `${method} ${path}` },
  }
}
