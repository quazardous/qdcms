/**
 * Tiny path router — split-and-compare. No regex.
 *
 * Patterns use `:name` for named segments (e.g. `/entity/:name/:id`).
 * Trailing slashes are normalised. Query strings are NOT part of the
 * matching surface — the request's `query` field handles that.
 *
 * The router stores routes by `<METHOD> <pattern>` and exposes
 * `match(method, path)` returning either `{ handler, params }` or
 * `null`. Consumers handle the not-found case themselves to produce
 * the right error shape.
 */

import type { QdcmsHandler, QdcmsMethod } from './types'

interface Route {
  method: QdcmsMethod
  pattern: string
  segments: string[]
  handler: QdcmsHandler
}

export interface RouteMatch {
  handler: QdcmsHandler
  params: Record<string, string>
}

export class Router {
  private routes: Route[] = []

  add(method: QdcmsMethod, pattern: string, handler: QdcmsHandler): this {
    this.routes.push({
      method,
      pattern,
      segments: pattern.split('/').filter(Boolean),
      handler,
    })
    return this
  }

  /**
   * Find the first route that matches `method` + `path`. Path segments
   * are compared one by one; named patterns (`:name`) accept any
   * non-empty segment.
   */
  match(method: QdcmsMethod, path: string): RouteMatch | null {
    const segments = path.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== method) continue
      if (route.segments.length !== segments.length) continue

      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < route.segments.length; i++) {
        const ps = route.segments[i]
        const rs = segments[i]
        if (ps.startsWith(':')) {
          params[ps.slice(1)] = decodeURIComponent(rs)
        } else if (ps !== rs) {
          ok = false
          break
        }
      }
      if (ok) return { handler: route.handler, params }
    }
    return null
  }

  /**
   * Returns true if any route exists for this path (any method).
   * Used to distinguish 404 (path unknown) from 405 (path known but
   * not for this method).
   */
  hasPath(path: string): boolean {
    const segments = path.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.segments.length !== segments.length) continue
      let ok = true
      for (let i = 0; i < route.segments.length; i++) {
        const ps = route.segments[i]
        const rs = segments[i]
        if (!ps.startsWith(':') && ps !== rs) {
          ok = false
          break
        }
      }
      if (ok) return true
    }
    return false
  }
}
