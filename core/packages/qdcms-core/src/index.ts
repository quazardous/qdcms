/**
 * @quazardous/qdcms-core
 *
 * Migration / entity / module primitives for qdcms. Domain-agnostic at
 * the contract level (no "block", "placement", or other CMS-specific
 * concept), but lives in the qdcms repo because qdcms is its primary
 * consumer (qdcms-backend, qdcms-frontend, qdcms-admin).
 *
 * Subpath exports:
 *   ./entity      — EntityDescriptor, Repository, Storage contracts
 *   ./registry    — ComponentManifest + ComponentRegistry (transitional, see
 *                   docs/modules.md ; will be folded into the Module/Plugin
 *                   Kernel once that lands)
 *   ./loader      — buildManifestFromPackageJson (npm-distributed plugins)
 *   ./migration   — Migration, hashSchema, composeSchema, OwnershipTracker (Node-only)
 *   ./sql         — MikroORM-backed BackendStorage / MigrationRunner (Node-only)
 *
 * The root barrel re-exports the always-safe subpaths (entity + registry).
 * `./migration` and `./sql` are Node-only (use node:crypto, fs, etc.) —
 * import them explicitly so browser bundles don't pull them in.
 */

export * from './entity/index'
export * from './registry/index'
