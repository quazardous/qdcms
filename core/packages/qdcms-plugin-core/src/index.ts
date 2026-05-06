/**
 * @quazardous/qdcms-plugin-core
 *
 * Foundational qdcms plugin. Provides the `core_users` and
 * `core_sessions` tables. Other plugins reference these (e.g. add
 * columns to `core_users` via `extensions:`).
 *
 * Future revisions of this package will export Vue components and
 * block declarations (UserPill, LoginForm, …) consumed by qdcms-aware
 * Vue apps. For Phase 3 init we ship only the schema — the qdcms
 * backend loads it via `@quazardous/qdcms-core/loader` against this
 * package's package.json + qdcms-plugin.yaml.
 */

// Empty for now. Future exports:
//   export { default as UserPill } from './components/UserPill.vue'
//   export { registerBlocks } from './registerBlocks'

export const QDCMS_PLUGIN_CORE_VERSION = '0.1.0'
