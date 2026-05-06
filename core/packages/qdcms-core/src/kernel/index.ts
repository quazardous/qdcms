/**
 * @quazardous/qdcms-core/kernel — public exports.
 *
 * Slot-based registry + topology resolver for Module + Plugin instances.
 * See `docs/modules.md` §5 for the design and §4 for chain semantics.
 */

export { Kernel } from './Kernel'
export type { RegisterModuleOptions, RegisterPluginOptions } from './Kernel'

export { registerSources } from './load'
export type { KernelSources, ModuleSource } from './load'

export type { ChainEntry, Citizenship, Slot } from './types'

export {
  KernelChainConflictError,
  KernelCycleError,
  KernelDependencyError,
  KernelError,
} from './types'
