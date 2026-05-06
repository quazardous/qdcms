/**
 * HTTP types — framework-agnostic request/response shapes.
 *
 * The qdcms backend doesn't bind to any HTTP framework (Express,
 * Fastify, Hono, native http, …). Consumers wrap `QdcmsBackend.handle`
 * with their framework of choice. The future `qdcms-api-emulator`
 * (Phase 3.c) wraps it with a fetch interceptor for browser-only demos.
 */

export type QdcmsMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface QdcmsRequest {
  method: QdcmsMethod
  /**
   * Path WITHOUT the `/api/qdcms` prefix. The HTTP wrapper strips
   * the prefix before calling `handle`. Examples: `/plugins`,
   * `/entity/user/abc-123`, `/schema-state`.
   */
  path: string
  /**
   * Query string parameters as already-parsed key/value pairs.
   * Multi-value keys (e.g. `?tag=a&tag=b`) yield an array.
   */
  query?: Record<string, string | string[]>
  /** Request headers (lowercase keys recommended). */
  headers?: Record<string, string>
  /**
   * Already-parsed request body. The HTTP wrapper handles JSON
   * parsing; the handler receives a JS value. May be `undefined`
   * for GET/DELETE.
   */
  body?: unknown
}

export interface QdcmsResponse<T = unknown> {
  /** HTTP status code (200 / 201 / 400 / 404 / 409 / 500 / …). */
  status: number
  /** Response body — typically a JSON-serialisable object. */
  body: T
  /** Optional response headers. */
  headers?: Record<string, string>
}

/**
 * Standard error envelope. Handlers return this shape in `body`
 * when status >= 400.
 */
export interface QdcmsErrorBody {
  error: string
  message: string
  details?: unknown
}

// ─── Route handler signature ──────────────────────────────────────────────

export interface QdcmsHandlerContext {
  /** Path params extracted by the router (e.g. `{ name: 'user', id: 'abc' }`). */
  params: Record<string, string>
  /** Reference to the live runtime stack — registry, storage, store, runner. */
  backend: QdcmsHandlerBackend
}

/**
 * The slice of the backend handle that route handlers may use.
 * Intentionally a minimal alias so we don't import the full
 * `QdcmsBackend` shape (would cause a cycle with createBackend).
 */
export interface QdcmsHandlerBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runner: any
}

export type QdcmsHandler = (
  req: QdcmsRequest,
  ctx: QdcmsHandlerContext,
) => Promise<QdcmsResponse>

// ─── Standard error helpers ───────────────────────────────────────────────

export function badRequest(message: string, details?: unknown): QdcmsResponse<QdcmsErrorBody> {
  return {
    status: 400,
    body: { error: 'BAD_REQUEST', message, details },
  }
}

export function notFound(message: string): QdcmsResponse<QdcmsErrorBody> {
  return { status: 404, body: { error: 'NOT_FOUND', message } }
}

export function methodNotAllowed(method: string, path: string): QdcmsResponse<QdcmsErrorBody> {
  return {
    status: 405,
    body: { error: 'METHOD_NOT_ALLOWED', message: `${method} ${path}` },
  }
}

export function conflict(message: string, details?: unknown): QdcmsResponse<QdcmsErrorBody> {
  return {
    status: 409,
    body: { error: 'CONFLICT', message, details },
  }
}

export function serverError(message: string, details?: unknown): QdcmsResponse<QdcmsErrorBody> {
  return {
    status: 500,
    body: { error: 'INTERNAL', message, details },
  }
}

export function ok<T>(body: T): QdcmsResponse<T> {
  return { status: 200, body }
}

export function created<T>(body: T): QdcmsResponse<T> {
  return { status: 201, body }
}

export function noContent(): QdcmsResponse<null> {
  return { status: 204, body: null }
}
