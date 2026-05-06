/**
 * `withLocale` — wraps a `StackBuilder` so that `route.meta.locale` is pushed
 * to `cms.setLocale()` on every navigation, before the inner builder runs.
 *
 * Without this wrapper, the active locale lives only in `route.meta` and the
 * `CmsContext.locale` field stays at its initial value — placement
 * conditions on `locale`, content fallbacks, and the `<LocaleLink>` resolution
 * all break.
 *
 * @example
 * ```ts
 * import { bindRouter } from 'qdcms'
 * import { withLocale } from 'qdcms/i18n'
 * import { declaredStackBuilder } from 'qdcms'
 *
 * bindRouter(router, cms, { stackBuilder: withLocale(declaredStackBuilder) })
 * ```
 */
import type { StackBuilder } from '../stack/StackBuilder'
import type { Locale } from './types'

export function withLocale(inner: StackBuilder): StackBuilder {
  return (input) => {
    const locale = input.route.meta?.locale as Locale | undefined
    if (locale && input.cms.context.locale !== locale) {
      input.cms.setLocale(locale)
    }
    return inner(input)
  }
}
