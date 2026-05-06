/**
 * Locale detection — chooses the active locale on first paint.
 *
 * Priority chain:
 *   1. URL prefix (`/fr/...`, `/en/...`)
 *   2. Cookie (`qdcms_locale` by default)
 *   3. `navigator.languages` (Accept-Language equivalent in SPAs)
 *   4. `defaultLocale`
 *
 * The function is pure: pass `url` / `navigatorLanguages` / `cookieReader`
 * explicitly when you need deterministic output (tests, SSR-style
 * pre-render).
 */

import type { Locale } from './types'

export interface DetectLocaleOptions {
  /** Locales the app supports. */
  available: Locale[]
  /** Locale used when nothing matches. Must be in `available`. */
  defaultLocale: Locale
  /** Cookie name carrying the user's preference. Default: `'qdcms_locale'`. */
  cookieName?: string
  /**
   * URL pathname to match against. Defaults to `location.pathname`. Pass
   * explicitly for tests / SSR.
   */
  url?: string
  /**
   * Browser language list (most preferred first). Defaults to
   * `navigator.languages`. Pass explicitly for tests / SSR.
   */
  navigatorLanguages?: readonly string[]
  /**
   * Cookie reader. Defaults to `document.cookie`. Pass explicitly for tests /
   * SSR. The function receives the cookie name and returns the value or null.
   */
  cookieReader?: (name: string) => string | null
}

/**
 * Run the priority chain and return the chosen locale.
 */
export function detectLocale(options: DetectLocaleOptions): Locale {
  const {
    available,
    defaultLocale,
    cookieName = 'qdcms_locale',
    url = typeof location !== 'undefined' ? location.pathname : '/',
    navigatorLanguages = typeof navigator !== 'undefined'
      ? (navigator.languages ?? [navigator.language].filter(Boolean))
      : [],
    cookieReader = readCookieFromDocument,
  } = options

  // 1. URL prefix
  const fromUrl = matchLocaleFromUrl(url, available)
  if (fromUrl) return fromUrl

  // 2. cookie
  const fromCookie = cookieReader(cookieName)
  if (fromCookie && available.includes(fromCookie)) return fromCookie

  // 3. navigator.languages
  for (const lang of navigatorLanguages) {
    if (!lang) continue
    if (available.includes(lang)) return lang
    const short = lang.slice(0, 2).toLowerCase()
    if (available.includes(short)) return short
  }

  return defaultLocale
}

/**
 * Extract the leading locale segment from a URL pathname.
 * Returns `null` if the first segment is not a known locale.
 *
 * Recognises `/fr`, `/fr/`, `/fr/whatever`. Trailing slashes / query strings
 * / hashes are tolerated.
 */
export function matchLocaleFromUrl(url: string, available: Locale[]): Locale | null {
  const path = url.split('?')[0]?.split('#')[0] ?? '/'
  const segs = path.split('/').filter(Boolean)
  const first = segs[0]
  if (!first) return null
  return available.includes(first) ? first : null
}

function readCookieFromDocument(name: string): string | null {
  if (typeof document === 'undefined') return null
  const target = `${name}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length))
    }
  }
  return null
}

/**
 * Convenience: write the locale preference cookie. Mirrors what
 * `LangSwitcher` does on user action — exposed so non-component callers
 * (e.g. SSR-injected scripts) can persist as well.
 *
 * Default lifetime: 1 year. Path: `/`. SameSite: `Lax` for SPA navigation.
 */
export function persistLocaleCookie(
  locale: Locale,
  options: { name?: string; maxAgeSeconds?: number } = {}
): void {
  if (typeof document === 'undefined') return
  const name = options.name ?? 'qdcms_locale'
  const maxAge = options.maxAgeSeconds ?? 60 * 60 * 24 * 365
  document.cookie = `${name}=${encodeURIComponent(locale)}; path=/; max-age=${maxAge}; SameSite=Lax`
}
