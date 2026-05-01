/**
 * `LocaleUrlBuilder` implementations.
 *
 * The same contract powers prefix-based URLs (`/fr/foo`) today and
 * domain-based URLs (`https://fr.example.com/foo`) tomorrow. Consumers
 * (`<RouterLink>` helpers, LangSwitcher, SEO `<link rel="alternate">`,
 * canonical, sitemap) only see the contract.
 */

import { buildSlugPath } from './slugTable'
import type { Locale, LocaleUrlBuilder, SlugTable } from './types'

export interface PrefixUrlBuilderOptions {
  slugTable: SlugTable
}

/**
 * Build URLs of the form `/${locale}/${...slug-path}`.
 * `:param` placeholders inside slugs are interpolated from `params`.
 */
export function createPrefixUrlBuilder(options: PrefixUrlBuilderOptions): LocaleUrlBuilder {
  const { slugTable } = options
  return (locale, name, params = {}) => {
    const path = buildSlugPath(slugTable, name, locale)
    return interpolate(`/${locale}/${path}`.replace(/\/+$/, '/'), params)
  }
}

export interface DomainUrlBuilderOptions {
  slugTable: SlugTable
  /** locale → host. Example: `{ fr: 'site.fr', en: 'site.com' }`. */
  domains: Record<Locale, string>
  /** Protocol prefix. Default: `'https://'`. */
  protocol?: string
}

/**
 * Build URLs of the form `${protocol}${domains[locale]}/${...slug-path}`.
 *
 * Use when SEO geo-targeting matters more than ops simplicity, or when
 * per-locale hosting / CDN edge / data residency comes into play.
 */
export function createDomainUrlBuilder(options: DomainUrlBuilderOptions): LocaleUrlBuilder {
  const { slugTable, domains, protocol = 'https://' } = options
  return (locale, name, params = {}) => {
    const host = domains[locale]
    if (!host) {
      throw new Error(`[qdcms/i18n] domain builder: no host configured for locale "${locale}"`)
    }
    const path = buildSlugPath(slugTable, name, locale)
    return interpolate(`${protocol}${host}/${path}`.replace(/\/+$/, '/'), params)
  }
}

/**
 * Replace `:name` segments in `template` with values from `params`.
 * Throws when a placeholder is missing — fail fast over emitting a broken URL.
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/:([A-Za-z_][\w]*)/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined || value === null) {
      throw new Error(
        `[qdcms/i18n] URL builder: missing param "${key}" for template "${template}"`
      )
    }
    return encodeURIComponent(String(value))
  })
}
