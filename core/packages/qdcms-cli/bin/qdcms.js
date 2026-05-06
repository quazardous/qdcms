#!/usr/bin/env node
/**
 * bin/qdcms.js — entry shim for the qdcms CLI.
 *
 * Spawns the TS sources via tsx so we don't need a build step
 * during development. tsx is a workspace dep ; npm typically
 * hoists it to the monorepo root's node_modules/.bin, so we
 * walk up from this file to find it.
 *
 * Before publish, a `prepack` step will compile src/ to dist/
 * and this shim will switch to the compiled output.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const entry = resolve(here, '..', 'src', 'index.ts')

function findTsxBin(start) {
  let dir = resolve(start)
  while (true) {
    const candidate = resolve(dir, 'node_modules', '.bin', 'tsx')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        `[qdcms] could not locate tsx — walked up from ${start} ` +
          `looking for node_modules/.bin/tsx and found none. ` +
          `Run \`npm install\` at the qdcms repo root.`,
      )
    }
    dir = parent
  }
}

const tsxBin = findTsxBin(here)
const result = spawnSync(tsxBin, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status ?? 1)
