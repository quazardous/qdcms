/**
 * `qdcms config:compile` — compile instance config YAML into
 * typed TS modules under `<instance>/config/.compiled/`.
 *
 * See docs/config.md for the full contract.
 */

import { Args, Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { compileConfig } from '@quazardous/qdcms-core/config'

export default class ConfigCompile extends Command {
  static override description =
    'Compile instance config YAML files into typed TS modules.'

  static override examples = [
    '<%= config.bin %> config:compile demo/config',
    '<%= config.bin %> config:compile --instance ./config',
    '<%= config.bin %> config:compile --json',
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
    out: Flags.directory({
      char: 'o',
      description:
        'Output directory for the compiled artefacts (default: <instance>/.compiled).',
    }),
    json: Flags.boolean({
      description: 'Print the result as JSON instead of human text.',
    }),
  }

  public async run(): Promise<{ namespaces: string[]; outputs: string[]; warnings: number }> {
    const { args, flags } = await this.parse(ConfigCompile)

    const instanceDir = resolve(
      flags.instance ?? args.instance ?? './config',
    )
    const outDir = flags.out ? resolve(flags.out) : undefined

    const t0 = performance.now()
    const result = await compileConfig({ instanceDir, outDir })
    const elapsed = Math.round(performance.now() - t0)

    if (flags.json) {
      this.logJson({
        namespaces: Object.fromEntries(
          Object.entries(result.namespaces).map(([k, v]) => [k, Object.keys(v)]),
        ),
        outputs: result.outputs,
        warnings: result.warnings,
        elapsedMs: elapsed,
      })
    } else {
      const conceptCount = Object.values(result.namespaces).reduce(
        (acc, ns) => acc + Object.keys(ns).length,
        0,
      )
      this.log(
        `[qdcms config:compile] ${conceptCount} concept(s) across ${
          Object.keys(result.namespaces).length
        } namespace(s) → ${result.outputs.length} file(s) emitted in ${elapsed}ms`,
      )
      for (const [ns, concepts] of Object.entries(result.namespaces)) {
        this.log(`  ${ns} → ${Object.keys(concepts).join(', ')}`)
      }
      for (const w of result.warnings) {
        this.warn(`${w.kind}: ${w.message}`)
      }
    }

    return {
      namespaces: Object.keys(result.namespaces),
      outputs: result.outputs,
      warnings: result.warnings.length,
    }
  }
}
