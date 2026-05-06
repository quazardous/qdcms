/**
 * Module — base class for qdcms-core modules and plugins.
 *
 * Augments qdadm's Module concept with hooks qdcms needs (compile-time
 * + backend) while keeping the existing frontend lifecycle intact. See
 * `docs/modules.md` §2 for the design.
 *
 * A Module is the unit of behaviour the Kernel orchestrates. Two
 * citizenships :
 * - **module** : ships inside qdcms-core (or another framework package),
 *   imported directly. Loose discipline.
 * - **plugin** : standalone npm package, satisfies the strict `Plugin`
 *   interface (see slice M2). Discovered at boot.
 *
 * Both extend this class. The difference is packaging + isolation
 * discipline, not behaviour.
 *
 * **Slice M1 scope** : the class shape and default lifecycle no-ops.
 * The Kernel that orchestrates the lifecycle ships in slice M4 ; until
 * then the migration runner (qdcms-core/sql) keeps consuming the
 * legacy ComponentManifest shape. M3 wraps the existing config code as
 * a `ConfigModule extends Module`.
 */

import type {
  BackendContext,
  EntityDescriptor,
  FrontendContext,
  HttpRouter,
  Migration,
  ModuleOptions,
  NamespaceSchema,
} from './types'

export class Module {
  // ─── Identity ────────────────────────────────────────────────

  /** Unique module name (used for dependency resolution). */
  static moduleName = 'base'

  /** Names of modules that must load first. */
  static requires: readonly string[] = []

  /** Load priority — higher loads later (cross-module wiring). */
  static priority = 0

  // ─── Frontend (qdadm-existing) ───────────────────────────────

  /**
   * Path to module styles (relative or absolute import). Loaded once
   * before `connect()` runs, cached.
   *
   * @example
   *   class DebugModule extends Module {
   *     static styles = () => import('./styles.scss')
   *   }
   */
  static styles: (() => Promise<unknown>) | null = null

  // ─── Compile-time (qdcms additions) ──────────────────────────

  /**
   * Validators for instance YAML files this module owns. Walked by
   * `qdcms config:compile` to validate the user's YAML and produce
   * compiled TS modules.
   */
  static configSchemas: readonly NamespaceSchema[] = []

  /**
   * Path to an oclif commands directory this module contributes. The
   * qdcms CLI loader merges these at startup so module-shipped
   * commands appear under the unified `qdcms` binary.
   */
  static cliCommands: string | null = null

  // ─── Backend (qdcms additions) ───────────────────────────────

  /**
   * Entity descriptors this module owns (its own DB tables). The
   * migration runtime composes these across active modules and emits
   * the schema diff at install/uninstall.
   */
  static entities: readonly EntityDescriptor[] = []

  /**
   * Pre-baked migrations this module ships. Today the migration runner
   * recomposes the desired schema and lets MikroORM compute the diff —
   * `migrations` is reserved for slice M4+ when explicit migration
   * files become first-class.
   */
  static migrations: readonly Migration[] = []

  // ─── Instance state ──────────────────────────────────────────

  options: ModuleOptions
  protected _signalCleanups: Array<() => void> = []
  protected _stylesLoaded = false

  constructor(options: ModuleOptions = {}) {
    this.options = options
  }

  /**
   * Module name resolved per the qdadm convention :
   * options.name > own static moduleName > own static name >
   * inherited moduleName.
   */
  get name(): string {
    if (this.options.name) {
      return this.options.name
    }
    const ctor = this.constructor as typeof Module
    if (Object.hasOwn(ctor, 'moduleName')) {
      return ctor.moduleName
    }
    if (Object.hasOwn(ctor, 'name')) {
      return ctor.name as unknown as string
    }
    return ctor.moduleName
  }

  // ─── Lifecycle (default no-ops, override in subclasses) ──────

  /**
   * Should this module be active in the given context ? Override for
   * conditional loading (e.g. dev-only modules).
   */
  enabled(_ctx: unknown): boolean {
    return true
  }

  /**
   * Load module styles if defined. Called by the loader before
   * `connect()`. Idempotent.
   */
  async loadStyles(): Promise<void> {
    const stylesLoader = (this.constructor as typeof Module).styles
    if (this._stylesLoaded || !stylesLoader) return

    try {
      await stylesLoader()
      this._stylesLoaded = true
    } catch (e) {
      console.warn(
        `[${(this.constructor as typeof Module).moduleName}] Failed to load styles:`,
        e,
      )
    }
  }

  /**
   * Connect the module to the running frontend kernel — register
   * routes, signal listeners, providers, etc. Override in subclass.
   */
  async connect(_ctx: FrontendContext): Promise<void> {
    // Override in subclass.
  }

  /**
   * Disconnect from the kernel. The default cleans up signal listeners
   * registered via `_addSignalCleanup`. Override to add more, but call
   * `super.disconnect()` to keep the cleanup.
   */
  async disconnect(): Promise<void> {
    for (const cleanup of this._signalCleanups) {
      cleanup()
    }
    this._signalCleanups = []
  }

  // ─── Backend hooks (qdcms additions, default no-ops) ─────────

  /**
   * Apply install-time side effects : run migrations, seed default
   * data, etc. Override in subclass when needed.
   */
  async install(_ctx: BackendContext): Promise<void> {
    // Override in subclass.
  }

  /**
   * Reverse install-time side effects. Override in subclass when
   * needed.
   */
  async uninstall(_ctx: BackendContext): Promise<void> {
    // Override in subclass.
  }

  /**
   * Contribute HTTP routes to the backend router. The router shape is
   * defined by the host (Express, Fastify, qdcms's own buildRouter,
   * etc.) — for now treated as opaque. Override in subclass.
   */
  registerHttpRoutes(_router: HttpRouter, _ctx: BackendContext): void {
    // Override in subclass.
  }

  // ─── Internals ───────────────────────────────────────────────

  /**
   * Register a cleanup function called by `disconnect()`. Used by
   * higher layers (KernelContext.on / similar) to wire automatic
   * teardown of signal subscriptions.
   *
   * @internal
   */
  _addSignalCleanup(cleanup: () => void): void {
    this._signalCleanups.push(cleanup)
  }
}

export default Module
