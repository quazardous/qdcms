/**
 * @quazardous/qdcms-core/migration/hints — public exports.
 *
 * Hints are author-provided guidance on how to bring an instance from
 * one plugin version to the next. They live in `<plugin>/upgrades/`
 * as `<target-version>.yaml` files. See docs/plugins.md §9 for the
 * full design and step type reference.
 */

export type {
  UpgradeStep,
  RenameFieldStep,
  AddFieldStep,
  DropFieldStep,
  RenameTableStep,
  ChangeTypeStep,
  AddIndexStep,
  DropIndexStep,
  ScriptStep,
  UpgradeFile,
} from './types'

export {
  UpgradeFileError,
  UpgradeMinVersionError,
  UpgradeChainError,
} from './types'

export { parseUpgradeFile, type ParseUpgradeFileInput } from './parser'
export { loadUpgrades, type LoadUpgradesResult } from './loader'
export {
  resolveUpgradeChain,
  type ResolveUpgradeChainInput,
  type ResolveUpgradeChainResult,
} from './resolver'
