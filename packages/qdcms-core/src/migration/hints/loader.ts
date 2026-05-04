/**
 * loadUpgrades — discover and parse a plugin's upgrade hint files.
 *
 * Convention:
 *   <pluginPath>/upgrades/<target-version>.yaml
 *
 * Files whose name doesn't parse as semver are silently ignored (lets
 * authors keep `helpers/`, `README.md`, `*.ts` scripts, etc. in the
 * upgrades directory without tripping the loader).
 *
 * The loader is async (uses fs.promises) and Node-only.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, parse as parsePath, resolve as resolvePath } from 'node:path'
import { isValidSemver } from '../../plugin/validation'
import { parseUpgradeFile } from './parser'
import {
  UpgradeFile,
  UpgradeFileError,
} from './types'

export interface LoadUpgradesResult {
  /** Parsed files, keyed by target version. */
  files: Map<string, UpgradeFile>
  /**
   * Files in the upgrades directory whose name was a valid semver but
   * failed to parse. Useful for surfacing errors to the admin without
   * aborting the whole load.
   */
  errors: Array<{ filePath: string; error: UpgradeFileError }>
}

/**
 * Read `<pluginPath>/upgrades/` and return parsed files.
 *
 * If the upgrades directory does not exist, returns an empty result —
 * not having upgrades is a valid plugin shape.
 */
export async function loadUpgrades(pluginPath: string): Promise<LoadUpgradesResult> {
  const dir = resolvePath(pluginPath, 'upgrades')

  // Existence check; missing directory = no upgrades, return empty.
  try {
    const s = await stat(dir)
    if (!s.isDirectory()) return { files: new Map(), errors: [] }
  } catch {
    return { files: new Map(), errors: [] }
  }

  const entries = await readdir(dir)
  const files = new Map<string, UpgradeFile>()
  const errors: LoadUpgradesResult['errors'] = []

  for (const name of entries) {
    const parsed = parsePath(name)
    if (parsed.ext !== '.yaml' && parsed.ext !== '.yml') continue
    const targetVersion = parsed.name
    if (!isValidSemver(targetVersion)) continue // ignore non-version files

    const filePath = join(dir, name)
    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch (cause) {
      errors.push({
        filePath,
        error: new UpgradeFileError(
          `failed to read file: ${(cause as Error).message}`,
          filePath,
          cause,
        ),
      })
      continue
    }

    try {
      const file = parseUpgradeFile({ content, filePath, targetVersion })
      files.set(targetVersion, file)
    } catch (cause) {
      if (cause instanceof UpgradeFileError) {
        errors.push({ filePath, error: cause })
      } else {
        errors.push({
          filePath,
          error: new UpgradeFileError(
            `unexpected: ${(cause as Error).message}`,
            filePath,
            cause,
          ),
        })
      }
    }
  }

  return { files, errors }
}
