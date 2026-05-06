/**
 * `qdcms config:compile` — compile instance config YAML into
 * typed TS modules under `<instance>/config/.compiled/`.
 *
 * See docs/config.md for the full contract.
 */

import { Args, Command, Flags } from '@oclif/core'
import { basename, dirname, join, resolve } from 'node:path'
import { ConfigModule, compileConfig } from '@quazardous/qdcms-core/config'
import { Kernel, registerSources } from '@quazardous/qdcms-core/kernel'

/**
 * Default compiled-output location follows the umbrella
 * convention : `<instance-umbrella>/.compiled/<input-basename>/`.
 * Example: `demo/config` → `demo/.compiled/config/`.
 *
 * `.compiled/` at the umbrella level is generic — other
 * compilation outputs (plugin schemas, content, …) can sit
 * alongside `config/` there.
 */
function defaultOutDir(instanceDir: string): string {
  return join(dirname(instanceDir), '.compiled', basename(instanceDir))
}

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
    const outDir = flags.out ? resolve(flags.out) : defaultOutDir(instanceDir)

    // Build the kernel and register every Module + Plugin source
    // the host knows about. Today : ConfigModule (statically imported)
    // — plugin discovery is additive once a real plugin needs loading.
    // The kernel aggregates configSchemas across the whole topology
    // so the compiler validates not just builtins but every
    // contributor's namespaces.
    const kernel = new Kernel()
    registerSources(kernel, { modules: [ConfigModule] })

    const t0 = performance.now()
    const result = await compileConfig({
      instanceDir,
      outDir,
      schemas: kernel.collectConfigSchemas(),
    })
    const elapsed = Math.round(performance.now() - t0)

    if (flags.json) {
      this.logJson({
        namespaces: Object.fromEntries(
          Object.entries(result.namespaces).map(([k, v]) => [k, Object.keys(v)]),
        ),
        outputs: result.outputs,
        warnings: result.warnings,
        cache: result.cache,
        elapsedMs: elapsed,
      })
    } else {
      const conceptCount = Object.values(result.namespaces).reduce(
        (acc, ns) => acc + Object.keys(ns).length,
        0,
      )
      const cacheTag = result.cache.hit
        ? ' [cache hit]'
        : result.cache.skippedConcepts > 0
          ? ` [${result.cache.skippedConcepts} concept(s) cached]`
          : ''
      this.log(
        `[qdcms config:compile] ${conceptCount} concept(s) across ${
          Object.keys(result.namespaces).length
        } namespace(s) → ${result.outputs.length} file(s) in ${elapsed}ms${cacheTag}`,
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
