/**
 * handle — main dispatch entry point. Wraps a `QdcmsBackend` and a
 * router into a single `(req) → response` function.
 *
 * Distinguishes 404 (path unknown) from 405 (path known but not for
 * this method) using `Router.hasPath`.
 */

import {
  badRequest,
  methodNotAllowed,
  notFound,
  serverError,
  type QdcmsHandlerBackend,
  type QdcmsRequest,
  type QdcmsResponse,
} from './types'
import { Router } from './router'
import {
  createEntity,
  deleteEntity,
  getEntity,
  getPlugins,
  getSchemaState,
  getSchemaStateForPlugin,
  listEntity,
  updateEntity,
} from './handlers'

/**
 * Build the standard qdcms HTTP router. Exposed for testing; consumers
 * normally just call `handle()` returned by `createBackend`.
 */
export function buildRouter(): Router {
  const r = new Router()
  r.add('GET', '/plugins', getPlugins)
  r.add('GET', '/entity/:name', listEntity)
  r.add('POST', '/entity/:name', createEntity)
  r.add('GET', '/entity/:name/:id', getEntity)
  r.add('PATCH', '/entity/:name/:id', updateEntity)
  r.add('DELETE', '/entity/:name/:id', deleteEntity)
  r.add('GET', '/schema-state', getSchemaState)
  r.add('GET', '/schema-state/:plugin', getSchemaStateForPlugin)
  return r
}

/**
 * Top-level dispatch function. Errors thrown by handlers turn into
 * 500 responses with the error message — handlers should prefer
 * returning structured errors via the helpers in `./types.ts` so the
 * client gets the right status code.
 */
export async function dispatch(
  router: Router,
  backend: QdcmsHandlerBackend,
  req: QdcmsRequest,
): Promise<QdcmsResponse> {
  if (typeof req.path !== 'string' || !req.path.startsWith('/')) {
    return badRequest('path must be a string starting with "/"')
  }

  const match = router.match(req.method, req.path)
  if (!match) {
    if (router.hasPath(req.path)) {
      return methodNotAllowed(req.method, req.path)
    }
    return notFound(`unknown route ${req.method} ${req.path}`)
  }

  try {
    return await match.handler(req, { params: match.params, backend })
  } catch (cause) {
    return serverError(
      `unhandled error in ${req.method} ${req.path}`,
      (cause as Error).message,
    )
  }
}
