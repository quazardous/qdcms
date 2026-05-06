/**
 * resolveUpgradeChain — given a current version and a target version,
 * compute the ordered list of UpgradeFile to apply.
 *
 * Algorithm:
 *   candidates = files where currentVersion < f.targetVersion <= targetVersion
 *   sort ascending by semver
 *   for each candidate in order:
 *     if file.minVersion exists and currentRunningState < file.minVersion:
 *       throw UpgradeMinVersionError
 *     append to chain
 *     currentRunningState = file.targetVersion
 *
 * The min_version check uses the RUNNING state (which advances as we
 * apply each file in the chain), not the original starting version.
 * That lets a chain that starts at v1.0 → v1.5 → v2.0 satisfy a
 * `min_version: 1.5.0` on the v2.0 file even though we started at 1.0.
 */

import { compare as compareSemver, gt as gtSemver, satisfies, valid } from 'semver'
import {
  UpgradeChainError,
  UpgradeFile,
  UpgradeMinVersionError,
} from './types'

export interface ResolveUpgradeChainInput {
  currentVersion: string | null
  targetVersion: string
  files: Map<string, UpgradeFile> | UpgradeFile[]
}

export interface ResolveUpgradeChainResult {
  chain: UpgradeFile[]
  /**
   * Versions skipped because their target was not in the (current,
   * target] range, OR because their range was satisfied by `*` /
   * empty (i.e. no constraint to apply). Useful for diagnostics.
   */
  skipped: string[]
}

export function resolveUpgradeChain(
  input: ResolveUpgradeChainInput,
): ResolveUpgradeChainResult {
  const { currentVersion, targetVersion } = input
  const files = Array.isArray(input.files)
    ? input.files
    : Array.from(input.files.values())

  if (!valid(targetVersion)) {
    throw new UpgradeChainError(`target version "${targetVersion}" is not valid semver`)
  }
  if (currentVersion !== null && !valid(currentVersion)) {
    throw new UpgradeChainError(`current version "${currentVersion}" is not valid semver`)
  }

  // Filter: candidates must target a version > current and <= target.
  // Special-case currentVersion === null: this is a fresh install (no
  // prior state), so we apply ALL files <= target. Conceptually,
  // before the first install the "current" is -Infinity.
  const inRange = files.filter((f) => {
    if (compareSemver(f.targetVersion, targetVersion) > 0) return false
    if (currentVersion === null) return true
    return gtSemver(f.targetVersion, currentVersion)
  })

  inRange.sort((a, b) => compareSemver(a.targetVersion, b.targetVersion))

  // Walk the candidates and check min_version against the running state.
  let runningState = currentVersion
  const chain: UpgradeFile[] = []
  for (const file of inRange) {
    if (file.minVersion !== undefined) {
      if (runningState === null || !satisfies(runningState, `>=${file.minVersion}`)) {
        throw new UpgradeMinVersionError(
          `cannot apply upgrade to ${file.targetVersion}: ` +
            `file requires the plugin to be at version >= ${file.minVersion}, ` +
            `but ${runningState ?? 'fresh install'} would be the running state at this step. ` +
            `Provide an intermediate upgrade file or relax the min_version guard.`,
          file.targetVersion,
          file.minVersion,
          runningState ?? '<none>',
        )
      }
    }
    chain.push(file)
    runningState = file.targetVersion
  }

  return {
    chain,
    skipped: files
      .filter((f) => !chain.includes(f))
      .map((f) => f.targetVersion),
  }
}
