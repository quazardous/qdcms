/**
 * @quazardous/qdcms-backend/http — HTTP API surface.
 *
 * Framework-agnostic. Consumers wrap `dispatch()` with their HTTP
 * framework or call directly (e.g. the future qdcms-api-emulator).
 */

export type {
  QdcmsMethod,
  QdcmsRequest,
  QdcmsResponse,
  QdcmsErrorBody,
  QdcmsHandler,
  QdcmsHandlerContext,
  QdcmsHandlerBackend,
} from './types'

export {
  badRequest,
  conflict,
  created,
  methodNotAllowed,
  noContent,
  notFound,
  ok,
  serverError,
} from './types'

export { Router, type RouteMatch } from './router'
export { buildRouter, dispatch } from './handle'
export {
  getPlugins,
  listEntity,
  getEntity,
  createEntity,
  updateEntity,
  deleteEntity,
  getSchemaState,
  getSchemaStateForPlugin,
} from './handlers'
