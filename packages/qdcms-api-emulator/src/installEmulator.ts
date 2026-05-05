/**
 * installEmulator — wrap `globalThis.fetch` so URLs matching a
 * configured base path are routed to a local `backend.handle()` and
 * everything else falls through to the real fetch.
 *
 * Use cases
 * - Static-site demos of qdcms-frontend (deploy on GitHub Pages, no
 *   backend server, but the frontend talks to a "real" HTTP API)
 * - Tests of qdcms-frontend without spinning a Docker / Node server
 * - Offline-first or low-trust environments where the qdcms backend
 *   runs in the browser tab itself
 *
 * Design constraints
 * - Pure monkey-patch on `globalThis.fetch` (no Service Worker —
 *   simpler deploy, no scope concerns, immediate activation)
 * - Drop-in: any consumer that calls `fetch(...)` works unchanged
 * - Reversible: `uninstall()` restores the original fetch reference
 * - Backend-agnostic: takes any `{ handle(req) }` shape, doesn't
 *   import anything backend-specific
 */

import type {
  QdcmsRequest,
  QdcmsResponse,
} from '@quazardous/qdcms-backend/http'

export interface EmulatorBackend {
  handle(req: QdcmsRequest): Promise<QdcmsResponse>
}

export interface InstallEmulatorOptions {
  backend: EmulatorBackend
  /**
   * Path prefix that routes to the emulated backend. Default
   * `/api/qdcms`. The prefix is stripped before the request is
   * passed to `backend.handle()` (the backend handler receives just
   * the qdcms route, e.g. `/plugins`, `/entity/user/abc`).
   */
  basePath?: string
  /**
   * Optional override for the fallback fetch (the one used for URLs
   * that don't match basePath). Default: the original `globalThis.fetch`
   * captured at install time. Tests pass a stub.
   */
  fallback?: typeof globalThis.fetch
  /**
   * If true (default), absolute URLs whose pathname starts with
   * basePath are also intercepted. Set false to only intercept
   * relative URLs that start with basePath.
   */
  matchAbsolute?: boolean
}

export interface EmulatorHandle {
  /** Restore the original `globalThis.fetch`. */
  uninstall(): void
  /** Number of requests routed through the emulator since install. */
  readonly interceptedCount: number
}

const DEFAULT_BASE_PATH = '/api/qdcms'

export function installEmulator(options: InstallEmulatorOptions): EmulatorHandle {
  const basePath = (options.basePath ?? DEFAULT_BASE_PATH).replace(/\/+$/, '')
  // Capture the original fetch WITHOUT binding so uninstall can
  // restore the exact same reference. Bind only when invoking, so
  // `this` is right (some impls require it).
  const original = globalThis.fetch
  const boundOriginal = original.bind(globalThis)
  const fallback = options.fallback ?? boundOriginal
  const matchAbsolute = options.matchAbsolute !== false

  let intercepted = 0

  const proxyFetch: typeof globalThis.fetch = async (input, init) => {
    const { matched, qdcmsReq, fallthroughInput } = parseInput(
      input,
      init,
      basePath,
      matchAbsolute,
    )
    if (!matched || !qdcmsReq) {
      return await fallback(fallthroughInput as Parameters<typeof globalThis.fetch>[0], init)
    }
    intercepted++
    let body: unknown
    if (init?.body !== undefined && init.body !== null) {
      const text = typeof init.body === 'string' ? init.body : await readBodyAsString(init.body)
      if (text) {
        try {
          body = JSON.parse(text)
        } catch {
          body = text
        }
      }
    }
    let response: QdcmsResponse
    try {
      response = await options.backend.handle({ ...qdcmsReq, body })
    } catch (cause) {
      response = {
        status: 500,
        body: {
          error: 'INTERNAL',
          message: `qdcms-api-emulator: backend.handle threw: ${(cause as Error).message}`,
        },
      }
    }
    return toFetchResponse(response)
  }

  globalThis.fetch = proxyFetch

  return {
    uninstall() {
      if (globalThis.fetch === proxyFetch) {
        globalThis.fetch = original
      }
    },
    get interceptedCount() {
      return intercepted
    },
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

interface ParsedInput {
  matched: boolean
  qdcmsReq?: Omit<QdcmsRequest, 'body'>
  /** Original input if not matched — passed to the fallback. */
  fallthroughInput: RequestInfo | URL
}

function parseInput(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  basePath: string,
  matchAbsolute: boolean,
): ParsedInput {
  const method = (init?.method ?? 'GET').toUpperCase() as QdcmsRequest['method']
  let urlStr: string
  if (typeof input === 'string') urlStr = input
  else if (input instanceof URL) urlStr = input.toString()
  else urlStr = input.url

  // Distinguish absolute vs relative.
  let pathname: string
  let search: string
  try {
    // Use a synthetic origin for relative URLs so we can use URL.
    const u = new URL(urlStr, 'http://__qdcms_emulator__')
    if (u.origin !== 'http://__qdcms_emulator__' && !matchAbsolute) {
      // Absolute URL but matchAbsolute disabled → skip.
      return { matched: false, fallthroughInput: input }
    }
    pathname = u.pathname
    search = u.search
  } catch {
    return { matched: false, fallthroughInput: input }
  }

  if (!pathname.startsWith(basePath + '/') && pathname !== basePath) {
    return { matched: false, fallthroughInput: input }
  }

  const qdcmsPath = pathname.slice(basePath.length) || '/'

  // Build the query record.
  const query: Record<string, string | string[]> = {}
  if (search) {
    const params = new URLSearchParams(search)
    for (const key of params.keys()) {
      const all = params.getAll(key)
      query[key] = all.length === 1 ? all[0] : all
    }
  }

  // Headers (lowercase keys).
  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v
      })
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k.toLowerCase()] = v
    } else {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k.toLowerCase()] = String(v)
      }
    }
  }

  return {
    matched: true,
    qdcmsReq: {
      method,
      path: qdcmsPath,
      query: Object.keys(query).length > 0 ? query : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    },
    fallthroughInput: input,
  }
}

async function readBodyAsString(body: BodyInit): Promise<string> {
  if (typeof body === 'string') return body
  if (body instanceof Blob) return await body.text()
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body.buffer as ArrayBuffer)
  }
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof FormData) {
    // FormData → JSON object (best-effort; the qdcms API expects JSON).
    const obj: Record<string, unknown> = {}
    body.forEach((v, k) => {
      obj[k] = v
    })
    return JSON.stringify(obj)
  }
  // ReadableStream is not supported in this best-effort path.
  return ''
}

function toFetchResponse(response: QdcmsResponse): Response {
  const status = response.status
  if (status === 204 || response.body === null || response.body === undefined) {
    return new Response(null, { status, headers: response.headers })
  }
  const body = JSON.stringify(response.body)
  const headers = new Headers(response.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return new Response(body, { status, headers })
}
