import { computed, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { useCms } from './useCms'
import type { Locale, LocaleUrlBuilder } from '../i18n/types'

/**
 * `useLocaleUrl()` — the only sanctioned way to compute a navigation URL
 * inside a qdcms component.
 *
 * Returns a function `(name, params?, locale?) => string` that goes through
 * the active `LocaleUrlBuilder` registered on the cms. The locale defaults
 * to the current route's locale (from `route.meta.locale`), so calling
 * `urlFor('events')` from any block produces a URL in the current language.
 *
 * Hardcoded paths are structurally forbidden in qdcms code — always use this
 * (or `<LocaleLink>` in templates).
 *
 * @throws if no `urlBuilder` has been registered. Pass one via
 *         `createCms({ urlBuilder })` or `cms.setUrlBuilder(...)`.
 */
export interface LocaleUrlHelper {
  (name: string, params?: Record<string, string | number>, locale?: Locale): string
  /** Reactive ref to the active URL builder, useful in template-only callsites. */
  builder: ComputedRef<LocaleUrlBuilder | null>
  /** Active locale (from `route.meta.locale`), null when route has no locale. */
  currentLocale: ComputedRef<Locale | null>
}

export function useLocaleUrl(): LocaleUrlHelper {
  const cms = useCms()
  const route = useRoute()

  const builder = computed(() => cms.urlBuilder.value)
  const currentLocale = computed<Locale | null>(
    () => (route.meta.locale as Locale | undefined) ?? null
  )

  const helper = ((name: string, params?: Record<string, string | number>, locale?: Locale) => {
    const b = builder.value
    if (!b) {
      throw new Error(
        '[qdcms] useLocaleUrl(): no urlBuilder registered — call cms.setUrlBuilder() before navigation'
      )
    }
    const loc = locale ?? currentLocale.value
    if (!loc) {
      throw new Error(
        `[qdcms] useLocaleUrl("${name}"): no current locale — pass it explicitly or wait until router resolves a locale-aware route`
      )
    }
    return b(loc, name, params)
  }) as LocaleUrlHelper

  helper.builder = builder
  helper.currentLocale = currentLocale

  return helper
}
