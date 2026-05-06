/**
 * @quazardous/qdcms-core
 *
 * Plugin / migration / entity primitives for qdcms. Domain-agnostic at
 * the contract level (no "block", "placement", or other CMS-specific
 * concept), but lives in the qdcms repo because qdcms is its primary
 * consumer (qdcms-backend, qdcms-frontend, qdcms-admin).
 *
 * Subpath exports:
 *   ./entity      — EntityDescriptor, EntityRegistry, Repository, Storage contracts
 *   ./plugin      — PluginManifest, Plugin, PluginRegistry contract, InMemoryPluginRegistry
 *   ./migration   — Migration, hashSchema, composeSchema, OwnershipTracker (Node-only)
 *   ./sql         — MikroORM-backed BackendStorage / MigrationRunner (Node-only)
 *
 * The root barrel re-exports the always-safe subpaths (entity + plugin).
 * `./migration` and `./sql` are Node-only (use node:crypto, fs, etc.) —
 * import them explicitly so browser bundles don't pull them in.
 */

export * from './entity/index'
export * from './plugin/index'
