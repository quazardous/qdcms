/**
 * `qdcms install` — full install pipeline.
 *
 * Today : just runs `config:compile`. Slice CLI-3+ extends this
 * to plugin discovery, DB migrations, seed loading, smoke checks
 * (see docs/cli.md §3.3 + roadmap Axis 9).
 */

import { Command, Flags } from '@oclif/core'
import { basename, dirname, join, resolve } from 'node:path'
import { ConfigModule } from '@quazardous/qdcms-core/config'
import { DCModule } from '@quazardous/qdcms-core/dc'
import { Kernel, registerSources } from '@quazardous/qdcms-core/kernel'

/**
 * Umbrella convention for compiled artefacts :
 * `<instance-umbrella>/.compiled/<input-basename>/`. Matches the
 * default in `config:compile` so a single instance has one
 * `.compiled/` tree at the umbrella level (gitignored once).
 */
function defaultOutDir(instanceDir: string): string {
  return join(dirname(instanceDir), '.compiled', basename(instanceDir))
}

export default class Install extends Command {
  static override description =
    'Run the full install pipeline against an instance (config compile + future migrations + seed).'

  static override examples = [
    '<%= config.bin %> install --instance demo/config',
    '<%= config.bin %> install --instance demo/config --json',
  ]

  static override flags = {
    instance: Flags.directory({
      char: 'i',
      description: 'Path to the instance config directory.',
      default: './config',
    }),
    json: Flags.boolean({
      description: 'Print structured output instead of human text.',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Install)
    const instanceDir = resolve(flags.instance)
    const outDir = defaultOutDir(instanceDir)

    const stages: Array<{ name: string; ms: number; ok: boolean; detail?: string }> = []

    // Build a kernel + register the framework's modules. Plugin
    // discovery joins here in a follow-up slice.
    const kernel = new Kernel()
    registerSources(kernel, { modules: [ConfigModule, DCModule] })

    // Stage : config:compile.
    {
      const t0 = performance.now()
      try {
        const r = await ConfigModule.compile({ instanceDir, outDir, kernel })
        stages.push({
          name: 'config:compile',
          ms: Math.round(performance.now() - t0),
          ok: true,
          detail: `${Object.keys(r.namespaces).length} namespaces, ${r.outputs.length} outputs, ${r.warnings.length} warnings`,
        })
      } catch (e) {
        stages.push({
          name: 'config:compile',
          ms: Math.round(performance.now() - t0),
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // Future stages : migrations, plugin discovery, seed, smoke.
    // Stubs documented so the human output shows what's not yet
    // implemented :
    stages.push({ name: 'migrations', ms: 0, ok: true, detail: '(not yet implemented — slice CLI-3)' })
    stages.push({ name: 'seed', ms: 0, ok: true, detail: '(not yet implemented — slice CLI-3)' })

    if (flags.json) {
      this.logJson({ stages })
    } else {
      for (const s of stages) {
        const icon = s.ok ? '✓' : '✗'
        const ms = s.ms ? ` (${s.ms}ms)` : ''
        this.log(`  ${icon} ${s.name}${ms} — ${s.detail ?? 'OK'}`)
      }
      const failed = stages.filter((s) => !s.ok)
      if (failed.length > 0) {
        this.error(`install pipeline failed at ${failed[0]!.name}`, { exit: 1 })
      } else {
        this.log(
          `\n[qdcms install] OK — ${stages.length} stage(s), ${stages.reduce((a, s) => a + s.ms, 0)}ms total`,
        )
      }
    }
  }
}
