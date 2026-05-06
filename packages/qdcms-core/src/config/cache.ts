/**
 * config/cache.ts — two-level cache for the config compiler.
 *
 * Authoritative goal : never re-validate / re-emit a concept whose
 * inputs haven't changed since the last successful compile. See
 * docs/config.md §6.2 for the contract.
 *
 * Two layers :
 *
 *  1. **Timestamp pre-check** — `max(mtime(*.yaml))` vs the
 *     `.compiled/.cache.json` stamp mtime. Sub-millisecond on warm
 *     FS cache. If pre-check passes, the entire compile is a no-op.
 *
 *  2. **Per-concept hash** — `sha256(yaml content)` per file,
 *     keyed by concept. Skip validation + emit when the hash
 *     matches the cached entry.
 *
 * Cache invalidates entirely when :
 *  - the cache file is missing or its `version` doesn't match
 *    `CACHE_VERSION` (compiler upgrade),
 *  - any input file is newer than the cache stamp (shortcut path).
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export const CACHE_VERSION = 1
const CACHE_FILE = '.cache.json'

export interface CacheEntry {
  /** sha256 of the input YAML body that produced the compiled output. */
  hash: string
  /** Filename of the compiled artefact, relative to outDir. */
  out: string
}

export interface CacheState {
  version: number
  /** ISO 8601 of the last successful compile. */
  compiledAt: string
  /** Per-concept hash registry, keyed by `<namespace>.<concept>`. */
  concepts: Record<string, CacheEntry>
  /**
   * Resolved (validated, defaulted) value per concept, keyed by
   * `<namespace>.<concept>`. Stored so the fast-path cache hit can
   * return a complete `CompileConfigResult` without re-parsing
   * the YAML.
   */
  values?: Record<string, unknown>
}

/**
 * Read the existing cache, returning `null` when missing / invalid.
 */
export function readCache(outDir: string): CacheState | null {
  const path = join(outDir, CACHE_FILE)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as CacheState
    if (parsed.version !== CACHE_VERSION) return null
    if (!parsed.concepts || typeof parsed.concepts !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist the cache atomically (write to .tmp, rename) so a
 * crashed compile doesn't corrupt the cache.
 */
export function writeCache(outDir: string, state: CacheState): void {
  const path = join(outDir, CACHE_FILE)
  const tmpPath = path + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(state, null, 2))
  renameSync(tmpPath, path)
}

/**
 * Touch the cache file's mtime to "now" so the timestamp
 * pre-check passes on the next run. Called at the end of a
 * successful compile.
 */
export function touchCacheStamp(outDir: string): void {
  const path = join(outDir, CACHE_FILE)
  const now = new Date()
  utimesSync(path, now, now)
}

/**
 * Returns the most recent mtime across the given file paths, or 0
 * if the list is empty.
 */
export function maxMtime(paths: string[]): number {
  let maxMs = 0
  for (const p of paths) {
    try {
      const ms = statSync(p).mtimeMs
      if (ms > maxMs) maxMs = ms
    } catch {
      // missing file → treat as fresh (forces recompile).
      return Number.POSITIVE_INFINITY
    }
  }
  return maxMs
}

/**
 * Returns the cache stamp's mtime, or 0 if the cache file is
 * missing.
 */
export function cacheStampMtime(outDir: string): number {
  const path = join(outDir, CACHE_FILE)
  if (!existsSync(path)) return 0
  return statSync(path).mtimeMs
}

/**
 * Hash a file's content with sha256. Used to build per-concept
 * cache keys.
 */
export function hashFile(path: string): string {
  const content = readFileSync(path)
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Hash an arbitrary string buffer (used for derived concept hashes).
 */
export function hashString(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}
