/**
 * http.ts — HTTP adapter.
 *
 * Bridges Express's `(req, res)` shape and the qdcms-backend
 * `QdcmsRequest / QdcmsResponse` contract. Strips the
 * `/api/qdcms` prefix before dispatching (the backend handler
 * expects bare routes like `/plugins`, `/entity/user/abc`).
 *
 * Stays thin on purpose — anything HTTP-framework-specific lives
 * here, the rest of the package is framework-agnostic. Swap to
 * Fastify / Hono / native http by replacing this file alone.
 */

import type { Request, Response, Router } from 'express'
import type {
  QdcmsBackend,
  QdcmsRequest,
  QdcmsResponse,
} from '@quazardous/qdcms-backend'

const QDCMS_PREFIX = '/api/qdcms'

export function mountQdcmsRoutes(router: Router, backend: QdcmsBackend): void {
  router.use(QDCMS_PREFIX, async (req: Request, res: Response) => {
    const qdcmsReq: QdcmsRequest = {
      method: req.method as QdcmsRequest['method'],
      path: req.path || '/',
      query: normaliseQuery(req.query),
      headers: normaliseHeaders(req.headers),
      body: req.body,
    }

    let response: QdcmsResponse
    try {
      response = await backend.handle(qdcmsReq)
    } catch (cause) {
      response = {
        status: 500,
        body: {
          error: 'INTERNAL',
          message: (cause as Error).message,
        },
      }
    }

    if (response.headers) {
      for (const [k, v] of Object.entries(response.headers)) {
        res.setHeader(k, v)
      }
    }
    res.status(response.status)
    if (response.status === 204 || response.body === null || response.body === undefined) {
      res.end()
      return
    }
    res.json(response.body)
  })
}

function normaliseQuery(
  q: Request['query'],
): Record<string, string | string[]> | undefined {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === 'string') out[k] = v
    else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string')
    // ignore nested objects — qdcms contract is flat
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normaliseHeaders(
  h: Request['headers'],
): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === 'string') out[k.toLowerCase()] = v
    else if (Array.isArray(v)) out[k.toLowerCase()] = v.join(', ')
  }
  return Object.keys(out).length > 0 ? out : undefined
}
