/**
 * config.ts — typed config + env loader.
 *
 * `QdcmsServerConfig` is the shell's stable public input shape —
 * any breaking change here bumps the package's major version.
 * Keep the surface small ; richer needs become opt-in fields,
 * never hidden globals.
 */

export type SqlDialect = 'sqlite' | 'mariadb' | 'mysql' | 'postgres'

export interface QdcmsServerConfig {
  /** Port the HTTP server listens on. */
  port: number
  /**
   * MikroORM dbName : file path or `:memory:` for sqlite, DSN for
   * other dialects. Defaults to `:memory:` when loaded via
   * `loadConfigFromEnv`.
   */
  dbName: string
  /** SQL dialect — matches the migration runner's hashing. */
  dialect: SqlDialect
  /** Run plugin migrations at boot (default true). */
  installOnBoot: boolean
  /**
   * Absolute filesystem path to the qdcms repo (the "core"). The
   * plugin loader walks `<corePath>/node_modules` to discover
   * packages keyworded `qdcms-plugin`. Required — there's no sane
   * default that works across packaging shapes.
   */
  corePath: string
}

export interface LoadConfigOptions {
  /** Default `corePath` when `QDCMS_CORE` env is unset. */
  corePath: string
  /** Default port when `PORT` env is unset (default 5181). */
  defaultPort?: number
}

/**
 * Build a `QdcmsServerConfig` from `process.env`. The host instance
 * supplies its own `corePath` (typically computed via
 * `findQdcmsCore()`) since there's no portable way to guess it
 * from the shell package itself.
 *
 * Recognised env vars :
 *   PORT                   — listen port (default 5181)
 *   QDCMS_DB               — sqlite path or `:memory:` (default ':memory:')
 *   QDCMS_DIALECT          — 'sqlite' | 'mariadb' | 'mysql' | 'postgres'
 *   QDCMS_INSTALL_ON_BOOT  — 'true' | 'false' (default true)
 *   QDCMS_CORE             — overrides `options.corePath`
 */
export function loadConfigFromEnv(options: LoadConfigOptions): QdcmsServerConfig {
  return {
    port: envInt('PORT', options.defaultPort ?? 5181),
    dbName: process.env.QDCMS_DB ?? ':memory:',
    dialect: (process.env.QDCMS_DIALECT as SqlDialect) ?? 'sqlite',
    installOnBoot: envBool('QDCMS_INSTALL_ON_BOOT', true),
    corePath: process.env.QDCMS_CORE ?? options.corePath,
  }
}

// ─── _internal helpers ────────────────────────────────────────────────────

function envInt(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]
  if (v === undefined) return fallback
  return v === 'true' || v === '1' || v === 'yes'
}
