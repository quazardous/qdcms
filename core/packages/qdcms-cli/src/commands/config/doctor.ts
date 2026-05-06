/**
 * `qdcms config:doctor` — CI gate over the config compile.
 *
 * Runs the same pipeline as `config:compile` but exits non-zero
 * when ANY warning was emitted (deprecated fields, locked-field
 * violations, schema drift). Designed for CI : fail the build
 * before the warnings rot into hard errors at the next plugin
 * upgrade.
 *
 * `qdcms config:upgrade` (future slice C8b) will be the
 * interactive companion : reads `replacement` hints from the
 * schemas and rewrites the instance YAML for the author.
 */

import { Args, Command, Flags } from '@oclif/core'
import { basename, dirname, join, resolve } from 'node:path'
import { ConfigModule } from '@quazardous/qdcms-core/config'
import { Kernel, registerSources } from '@quazardous/qdcms-core/kernel'

function defaultOutDir(instanceDir: string): string {
  return join(dirname(instanceDir), '.compiled', basename(instanceDir))
}

export default class ConfigDoctor extends Command {
  static override description =
    'Run the config compile and fail the build on any warning (CI gate).'

  static override examples = [
    '<%= config.bin %> config:doctor demo/config',
    '<%= config.bin %> config:doctor --instance ./config --json',
  ]

  static override args = {
    instance: Args.directory({
      description:
        'Path to the instance config directory (default: ./config relative to cwd).',
      required: false,
    }),
  }

  static override flags = {
    instance: Flags.directory({
      char: 'i',
      description: 'Alternative way to specify the instance config directory.',
    }),
    json: Flags.boolean({
      description: 'Print the full report as JSON.',
    }),
    'no-cache': Flags.boolean({
      description:
        'Force a fresh recompile (ignore .compiled/.cache.json). Recommended in CI to catch warnings the cache might have masked.',
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigDoctor)
    const instanceDir = resolve(
      flags.instance ?? args.instance ?? './config',
    )
    const outDir = defaultOutDir(instanceDir)

    // Build the kernel + register sources so every Module / Plugin's
    // configSchemas flow into the compile (see config:compile for
    // the rationale).
    const kernel = new Kernel()
    registerSources(kernel, { modules: [ConfigModule] })

    const t0 = performance.now()
    let result
    try {
      result = await ConfigModule.compile({
        instanceDir,
        outDir,
        kernel,
        // Doctor forces noCache so cache hits don't mask the very
        // warnings doctor exists to surface. CI gates always want
        // fresh data.
        noCache: true,
      })
    } catch (e) {
      const elapsed = Math.round(performance.now() - t0)
      if (flags.json) {
        this.logJson({
          ok: false,
          elapsedMs: elapsed,
          error: e instanceof Error ? e.message : String(e),
        })
      } else {
        this.error(e instanceof Error ? e.message : String(e), { exit: 64 })
      }
      // this.error already exits, but TS doesn't know.
      return
    }
    const elapsed = Math.round(performance.now() - t0)

    const conceptCount = Object.values(result.namespaces).reduce(
      (acc, ns) => acc + Object.keys(ns).length,
      0,
    )

    if (flags.json) {
      this.logJson({
        ok: result.warnings.length === 0,
        elapsedMs: elapsed,
        concepts: conceptCount,
        warnings: result.warnings,
      })
    } else {
      this.log(
        `[qdcms config:doctor] ${conceptCount} concept(s) validated in ${elapsed}ms`,
      )
      for (const w of result.warnings) {
        this.warn(`${w.kind}: ${w.message}`)
      }
      if (result.warnings.length === 0) {
        this.log('[qdcms config:doctor] OK — no warnings.')
      }
    }

    if (result.warnings.length > 0) {
      // Exit code 65 (sysexit-style EX_DATAERR) — distinguishes a
      // config-quality failure from a system error (2) or a
      // user-input error (1).
      this.exit(65)
    }
  }
}
