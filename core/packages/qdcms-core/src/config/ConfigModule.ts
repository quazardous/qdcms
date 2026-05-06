/**
 * ConfigModule — wraps the framework's config layer as a Module.
 *
 * Owns the `qdcms.*` namespace : locales, plugins, etc. (see
 * `./builtin-schemas.ts`). Declared as a Module so the future Kernel
 * (slice M4) can walk it the same way it walks every other framework
 * piece — no special-casing.
 *
 * **Slice M3 scope** : declarative wrapper only. The compile pipeline
 * (`compileConfig`, `validateConcept`) keeps its loose exports for
 * backward compatibility ; the CLI keeps invoking them directly.
 * Slice M4 will switch the CLI to call `Kernel.boot({ phase: 'compile' })`
 * which iterates every Module's `configSchemas`.
 *
 * **Why citizenship = 'module'** : config is framework-essential. An
 * instance can't disable it ; if a fancier compiler arrives, that's a
 * separate plugin (`qdcms-plugin-config-compile-rust`) that replaces
 * only the compile-time bits, leaving ConfigModule as the schema
 * registry.
 */

import { Module } from '../module'
import { builtinSchemas } from './builtin-schemas'

export class ConfigModule extends Module {
  /** Slot name in the Kernel registry. */
  static moduleName = 'config'

  /**
   * Load order : config must be available before anything else can
   * read its YAML or rely on schema-registered plugins. Negative
   * priority keeps it at the head of the topological sort.
   */
  static priority = -100

  /**
   * Framework-owned config namespaces (`qdcms.*`). Plugins extend the
   * registry by contributing their own `plugin-<short>.*` schemas via
   * their own Module / Plugin definitions.
   */
  static configSchemas = builtinSchemas

  /**
   * The framework's CLI commands (`config:compile`, `config:doctor`,
   * `install`, …) live in `@quazardous/qdcms-cli` rather than alongside
   * this module. They are the canonical qdcms binary, not
   * module-contributed extras. `cliCommands` stays null — only
   * extension modules / plugins that ship their own commands set it.
   */
  static cliCommands: string | null = null

  /**
   * No DB entities yet. Slice C9 (`qdcms_config_live` for admin-side
   * runtime overrides) will land here when the admin write-back path
   * is built ; until then the compile pipeline writes nothing to the
   * database.
   */
  static entities = [] as const
}

export default ConfigModule
