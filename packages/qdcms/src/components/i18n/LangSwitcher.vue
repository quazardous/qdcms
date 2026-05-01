<script setup lang="ts">
/**
 * LangSwitcher — switch the active locale and translate the current URL.
 *
 * Uses the injected `LocaleUrlBuilder` (or a builder passed via props) so that
 * the URL strategy (prefix today, domain tomorrow) is transparent.
 *
 * Persists the choice in a cookie via `persistLocaleCookie` so the user
 * lands on the right locale on subsequent visits.
 *
 * Minimal styling on purpose — host apps typically restyle.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { persistLocaleCookie } from '../../i18n/detectLocale'
import type { Locale, LocaleUrlBuilder } from '../../i18n/types'

const props = defineProps<{
  /** Locales to render as buttons. Order is preserved. */
  locales: readonly Locale[]
  /**
   * URL builder used to translate the current route into the target locale.
   * Required — there's no global default; the host app passes the same
   * builder used to generate the route table.
   */
  buildUrl: LocaleUrlBuilder
  /**
   * Cookie name for persistence. Default: `'qdcms_locale'`.
   */
  cookieName?: string
  /**
   * Optional human-readable label per locale. Defaults to the locale code
   * uppercased (e.g. 'EN', 'FR').
   */
  labels?: Record<Locale, string>
}>()

const emit = defineEmits<{
  (e: 'change', locale: Locale): void
}>()

const route = useRoute()
const router = useRouter()

const currentLocale = computed<Locale | null>(() => (route.meta.locale as Locale | undefined) ?? null)
const currentRouteName = computed<string | null>(
  () => (route.meta.routeName as string | undefined) ?? null
)

function labelFor(locale: Locale): string {
  return props.labels?.[locale] ?? locale.toUpperCase()
}

function isCurrent(locale: Locale): boolean {
  return currentLocale.value === locale
}

function switchTo(locale: Locale): void {
  if (isCurrent(locale)) return
  const name = currentRouteName.value
  if (!name) {
    // No known route name — typical on the catch-all 404. Fall back to root.
    persistLocaleCookie(locale, props.cookieName ? { name: props.cookieName } : undefined)
    void router.push(`/${locale}`)
    emit('change', locale)
    return
  }
  let target: string
  try {
    target = props.buildUrl(locale, name, route.params as Record<string, string>)
  } catch (err) {
    // Builder threw (e.g. missing param) — degrade gracefully to root.
    console.warn('[qdcms/LangSwitcher] buildUrl failed, falling back to /' + locale, err)
    target = `/${locale}`
  }
  persistLocaleCookie(locale, props.cookieName ? { name: props.cookieName } : undefined)
  void router.push(target)
  emit('change', locale)
}
</script>

<template>
  <nav class="qdcms-lang-switcher" :aria-label="'Language'">
    <button
      v-for="locale in locales"
      :key="locale"
      type="button"
      :class="['qdcms-lang-switcher__item', { 'is-current': isCurrent(locale) }]"
      :aria-current="isCurrent(locale) ? 'true' : undefined"
      :disabled="isCurrent(locale)"
      @click="switchTo(locale)"
    >
      {{ labelFor(locale) }}
    </button>
  </nav>
</template>

<style scoped>
.qdcms-lang-switcher {
  display: inline-flex;
  gap: 0.25rem;
}
.qdcms-lang-switcher__item {
  font: inherit;
  padding: 0.25rem 0.6rem;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.qdcms-lang-switcher__item:disabled,
.qdcms-lang-switcher__item.is-current {
  cursor: default;
  opacity: 0.6;
}
</style>
