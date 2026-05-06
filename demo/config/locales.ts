/**
 * config/locales.ts — active locales + default.
 *
 * Source of truth for the i18n surface (§6.6 config-as-code). Per
 * structure.md, this file will eventually be a `locales.yaml`
 * compiled into the runtime artifact ; today it's straight TS.
 *
 * The Flower Craft demo started in French ; English was added as a
 * peer locale. Adding `de` would mean appending here AND adding the
 * per-slug translation in `slug-table.ts`. Both file edits in one
 * place, one PR.
 */

import type { Locale } from 'qdcms'

export const LOCALES: Locale[] = ['en', 'fr']
export const DEFAULT_LOCALE: Locale = 'en'
