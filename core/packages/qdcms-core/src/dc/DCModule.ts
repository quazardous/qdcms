/**
 * DCModule — dynamic content, first-class qdcms concept.
 *
 * **Citizenship = 'module'.** DC ships inside qdcms-core because the
 * page-composition model depends on it : page types compose around
 * the main contents that DC produces. An instance can't disable DC
 * meaningfully — without it the framework's content model has no
 * backbone. See `docs/modules.md` §6.2 + `docs/roadmap.md` Axis 2
 * for the full design.
 *
 * **Slot stays plugin-overridable** : if a future requirement asks
 * for a swappable DC backend (headless-CMS-backed alternative,
 * etc.), it arrives as a Plugin with `replaces: ['dc']`. The slot
 * accepts the override the day someone needs it ; the structural
 * pattern is already in place via the kernel's chain semantics.
 *
 * **Slice M7 scope (this file)** : skeleton declaration.
 *  - Static identity (moduleName='dc', requires=['config']).
 *  - configSchemas : `dc.types` minimal shape.
 *  - No entities yet — the `dc_type` table + per-type runtime
 *    tables come in M7+ when the migration runtime is wired into
 *    Kernel.installAll. For now DCModule just **registers** with
 *    the kernel so the topology has a real second module.
 *
 * Subsequent slices :
 *  - M7b : `dc_type` entity + initial migration + install seeding
 *    from `qdcms-core/config/install/dc.types.yaml` defaults.
 *  - M7c : per-type table-per-type runtime, registerHttpRoutes for
 *    `/api/qdcms/entity/dc/:type`.
 *  - Axis 2 cont. : main-content + page-type registration on the
 *    frontend `connect(ctx)`.
 */

import { Module } from '../module'
import { dcConfigSchemas } from './types-schema'

export class DCModule extends Module {
  /** Slot name in the Kernel registry. */
  static moduleName = 'dc'

  /**
   * DC reads the `qdcms.locales` config (for per-locale content
   * variants on localised fields, future slice) so it has to load
   * after ConfigModule.
   */
  static requires = ['config'] as const

  /**
   * Default priority. ConfigModule's `-100` ensures it sits above
   * DC ; DC's siblings (auth, search, …) compose around 0.
   */
  static priority = 0

  /**
   * The `dc.*` config namespace : type catalogue, field schemas,
   * URL patterns, etc. (skeleton in M7 ; expanded in subsequent
   * slices).
   */
  static configSchemas = dcConfigSchemas

  /**
   * Will declare `dc_type` + per-type tables in M7b.
   */
  static entities = [] as const
}

export default DCModule
