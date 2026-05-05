/**
 * @quazardous/qdcms-frontend
 *
 * Frontend runtime for qdcms-aware Vue 3 apps. Talks to qdcms-backend
 * over HTTP via `ApiFrontendStorage` (implements `FrontendStorage` from
 * qdcms-core), and exposes Vue composables (`useEntity`, `useCollection`)
 * that bind directly in templates and refresh reactively when entity
 * signals fire.
 *
 * Subpath exports:
 *   .              everything (storage + composables) re-exported
 *   ./storage      ApiFrontendStorage + ApiError
 *   ./composables  Vue composables only (no storage import)
 */

export * from './storage/index'
export * from './composables/index'
