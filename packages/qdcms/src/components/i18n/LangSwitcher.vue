<script setup lang="ts">
/**
 * LangSwitcher — switch the active locale and translate the current URL.
 *
 * Two visual variants:
 * - `'buttons'` (default): one button per locale, side-by-side.
 * - `'dropdown'`: a native `<select>` — compact, accessible, good for >2 locales
 *   or tight headers.
 *
 * Uses the injected `LocaleUrlBuilder` so the URL strategy (prefix today,
 * domain tomorrow) is transparent. Persists the choice in a cookie via
 * `persistLocaleCookie`.
 *
 * Minimal styling on purpose — host apps typically restyle.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { persistLocaleCookie } from '../../i18n/detectLocale'
import type { Locale, LocaleUrlBuilder } from '../../i18n/types'

const props = withDefaults(
  defineProps<{
    /** Locales to render. Order is preserved. */
    locales: readonly Locale[]
    /**
     * URL builder used to translate the current route into the target locale.
     * Required — there's no global default; the host app passes the same
     * builder used to generate the route table.
     */
    buildUrl: LocaleUrlBuilder
    /**
     * Visual variant. Default: `'buttons'`.
     */
    variant?: 'buttons' | 'dropdown'
    /**
     * Cookie name for persistence. Default: `'qdcms_locale'`.
     */
    cookieName?: string
    /**
     * Optional human-readable label per locale. Defaults to the locale code
     * uppercased (e.g. 'EN', 'FR').
     */
    labels?: Record<Locale, string>
  }>(),
  {
    variant: 'buttons',
  }
)

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

function onSelectChange(e: Event): void {
  const target = e.target as HTMLSelectElement
  const next = target.value as Locale
  switchTo(next)
}
</script>

<template>
  <select
    v-if="variant === 'dropdown'"
    class="qdcms-lang-switcher qdcms-lang-switcher--dropdown"
    :aria-label="'Language'"
    :value="currentLocale ?? locales[0]"
    @change="onSelectChange"
  >
    <option v-for="locale in locales" :key="locale" :value="locale">
      {{ labelFor(locale) }}
    </option>
  </select>
  <nav v-else class="qdcms-lang-switcher" :aria-label="'Language'">
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

/* Dropdown variant — minimal native select that inherits typography. Host
   apps typically restyle for their visual brand. */
.qdcms-lang-switcher--dropdown {
  font: inherit;
  padding: 0.25rem 1.5rem 0.25rem 0.6rem;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path fill='currentColor' d='M2 4l4 4 4-4z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 0.4rem center;
  background-size: 10px;
}
.qdcms-lang-switcher--dropdown:focus {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
</style>
