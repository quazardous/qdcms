<script setup lang="ts">
/**
 * `<LocaleLink>` — the only sanctioned `<RouterLink>` wrapper inside qdcms.
 *
 * Accepts a logical route **name** (never a path) and resolves it through
 * the active `LocaleUrlBuilder` registered on the cms. Hardcoded paths
 * (`<RouterLink to="/foo">`) are structurally forbidden in qdcms code —
 * always use this for internal navigation.
 *
 * @example
 * <LocaleLink name="events">{{ t('nav.events') }}</LocaleLink>
 * <LocaleLink name="event-detail" :params="{ slug: e.slug }">
 *   {{ e.title }}
 * </LocaleLink>
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useLocaleUrl } from '../composables/useLocaleUrl'
import type { Locale } from '../i18n/types'

const props = defineProps<{
  /** Logical route name (the `RouteSpec.name`). */
  name: string
  /** Params interpolated into the slug template. */
  params?: Record<string, string | number>
  /**
   * Force a specific locale. Default: the current route's locale.
   * Useful for `<link rel="alternate">` style cross-locale links.
   */
  locale?: Locale
}>()

const urlFor = useLocaleUrl()

const target = computed(() => urlFor(props.name, props.params, props.locale))
</script>

<template>
  <RouterLink :to="target">
    <slot />
  </RouterLink>
</template>
