/**
 * resolveUpgradeChain — pure-function tests.
 *
 * Coverage: range filtering, semver ordering, min_version guard
 * (against the running state at each step), fresh-install case,
 * skipped tracking.
 */

import { describe, expect, it } from 'vitest'
import {
  resolveUpgradeChain,
  UpgradeChainError,
  UpgradeMinVersionError,
  type UpgradeFile,
} from '../../src/migration/hints'

function mkFile(version: string, minVersion?: string): UpgradeFile {
  return {
    targetVersion: version,
    filePath: `upgrades/${version}.yaml`,
    minVersion,
    steps: [
      { kind: 'drop_field', entity: 'posts', field: 'legacy' },
    ],
  }
}

describe('resolveUpgradeChain — range filtering', () => {
  it('selects files in (current, target]', () => {
    const result = resolveUpgradeChain({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      files: [mkFile('1.5.0'), mkFile('2.0.0'), mkFile('3.0.0'), mkFile('0.5.0')],
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual(['1.5.0', '2.0.0'])
    expect(result.skipped.sort()).toEqual(['0.5.0', '3.0.0'])
  })

  it('orders chain by semver ascending', () => {
    const result = resolveUpgradeChain({
      currentVersion: '1.0.0',
      targetVersion: '3.0.0',
      files: [mkFile('2.0.0'), mkFile('1.5.0'), mkFile('2.10.0'), mkFile('2.2.0')],
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual([
      '1.5.0',
      '2.0.0',
      '2.2.0',
      '2.10.0',
    ])
  })

  it('returns empty chain when current === target', () => {
    const result = resolveUpgradeChain({
      currentVersion: '2.0.0',
      targetVersion: '2.0.0',
      files: [mkFile('1.5.0'), mkFile('2.0.0')],
    })
    expect(result.chain).toEqual([])
  })

  it('returns empty chain when no files in range', () => {
    const result = resolveUpgradeChain({
      currentVersion: '2.0.0',
      targetVersion: '3.0.0',
      files: [mkFile('1.5.0'), mkFile('1.8.0')],
    })
    expect(result.chain).toEqual([])
  })
})

describe('resolveUpgradeChain — fresh install (currentVersion = null)', () => {
  it('applies all files <= target', () => {
    const result = resolveUpgradeChain({
      currentVersion: null,
      targetVersion: '2.0.0',
      files: [mkFile('1.0.0'), mkFile('2.0.0'), mkFile('3.0.0')],
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual(['1.0.0', '2.0.0'])
  })

  it('rejects file with min_version on fresh install', () => {
    expect(() =>
      resolveUpgradeChain({
        currentVersion: null,
        targetVersion: '2.0.0',
        files: [mkFile('2.0.0', '1.0.0')],
      }),
    ).toThrow(UpgradeMinVersionError)
  })

  it('fresh install with no files in range = empty chain', () => {
    const result = resolveUpgradeChain({
      currentVersion: null,
      targetVersion: '0.5.0',
      files: [mkFile('1.0.0')],
    })
    expect(result.chain).toEqual([])
  })
})

describe('resolveUpgradeChain — min_version guard', () => {
  it('passes when running state satisfies min_version', () => {
    const result = resolveUpgradeChain({
      currentVersion: '1.5.0',
      targetVersion: '2.0.0',
      files: [mkFile('2.0.0', '1.5.0')],
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual(['2.0.0'])
  })

  it('throws when running state below min_version', () => {
    expect(() =>
      resolveUpgradeChain({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        files: [mkFile('2.0.0', '1.5.0')],
      }),
    ).toThrow(/requires the plugin to be at version >= 1\.5\.0/)
  })

  it('chain advances running state — min_version satisfied via intermediate', () => {
    // Start at 1.0.0. Apply 1.5.0 first (no min_version) → running state
    // becomes 1.5.0. Then 2.0.0 with min_version 1.5.0 — passes.
    const result = resolveUpgradeChain({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      files: [mkFile('1.5.0'), mkFile('2.0.0', '1.5.0')],
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual(['1.5.0', '2.0.0'])
  })

  it('UpgradeMinVersionError carries the version triple', () => {
    try {
      resolveUpgradeChain({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        files: [mkFile('2.0.0', '1.5.0')],
      })
    } catch (e) {
      expect(e).toBeInstanceOf(UpgradeMinVersionError)
      const err = e as UpgradeMinVersionError
      expect(err.targetVersion).toBe('2.0.0')
      expect(err.minVersion).toBe('1.5.0')
      expect(err.currentVersion).toBe('1.0.0')
      return
    }
    expect.fail('should have thrown')
  })
})

describe('resolveUpgradeChain — input validation', () => {
  it('rejects invalid target version', () => {
    expect(() =>
      resolveUpgradeChain({
        currentVersion: '1.0.0',
        targetVersion: 'wat',
        files: [],
      }),
    ).toThrow(UpgradeChainError)
  })

  it('rejects invalid current version (when not null)', () => {
    expect(() =>
      resolveUpgradeChain({
        currentVersion: 'wat',
        targetVersion: '2.0.0',
        files: [],
      }),
    ).toThrow(UpgradeChainError)
  })

  it('accepts files passed as a Map (matches loader return shape)', () => {
    const map = new Map([
      ['1.5.0', mkFile('1.5.0')],
      ['2.0.0', mkFile('2.0.0')],
    ])
    const result = resolveUpgradeChain({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      files: map,
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual(['1.5.0', '2.0.0'])
  })
})

describe('resolveUpgradeChain — skipped accounting', () => {
  it('reports versions outside the range as skipped', () => {
    const result = resolveUpgradeChain({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      files: [mkFile('0.5.0'), mkFile('1.5.0'), mkFile('3.0.0')],
    })
    expect(result.chain.map((f) => f.targetVersion)).toEqual(['1.5.0'])
    expect(result.skipped.sort()).toEqual(['0.5.0', '3.0.0'])
  })
})
