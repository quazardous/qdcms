/**
 * ComposedPageCollector — surfaces the latest result of `cms.composedPage`:
 * which layout was picked, and which blocks landed in which regions.
 *
 * State-only. Notifies the bridge on every `cms:page-composed`.
 */
import {
  Collector,
  type CollectorContext,
  type CollectorManifest,
  type CollectorSnapshot,
} from '@quazardous/qddebug'
import type { Cms } from 'qdcms'

export class ComposedPageCollector extends Collector {
  static override collectorName = 'composed-page'
  static override records = false

  private _cms: Cms | null = null
  private _unsub: (() => void) | null = null

  protected override _doInstall(ctx: CollectorContext): void {
    this._cms = (ctx as { cms?: Cms }).cms ?? null
    if (!this._cms) {
      console.warn('[ComposedPageCollector] no `cms` in install context — bridge will show empty state')
      return
    }
    this._unsub = this._cms.signals.on('cms:page-composed', () => {
      this.notifyChange()
    })
  }

  protected override _doUninstall(): void {
    this._unsub?.()
    this._unsub = null
  }

  override describe(): CollectorManifest {
    return {
      name: this.name,
      records: false,
      summary:
        'Live snapshot of cms.composedPage: layout name + region → resolved blocks (with their props). Re-emits on every cms:page-composed.',
      stateShape: {
        composing: 'boolean',
        layout: 'string?',
        regions: 'Record<region, ResolvedBlock[]>',
      },
      actions: this._builtinActionManifests(),
    }
  }

  override snapshot(): CollectorSnapshot {
    const composing = this._cms?.composing.value ?? false
    const page = this._cms?.composedPage.value ?? null

    const regions: Record<string, unknown[]> = {}
    if (page) {
      for (const [name, blocks] of Object.entries(page.regions ?? {})) {
        regions[name] = (blocks as unknown[]).map((b) => {
          const block = b as { name?: string; placementId?: string; props?: unknown }
          return {
            name: block.name,
            placementId: block.placementId,
            props: block.props,
          }
        })
      }
    }

    return {
      name: this.name,
      entries: [],
      count: 0,
      unseen: 0,
      state: {
        composing,
        layout: page?.layout ?? null,
        regions,
      },
    }
  }
}
