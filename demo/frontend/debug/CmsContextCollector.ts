/**
 * CmsContextCollector — exposes `cms.context` (route, stack, locale, auth,
 * tenant) as a debug-panel state surface.
 *
 * State-only: doesn't push entries on its own. Listens to qdcms signals
 * (`cms:stack-changed`, `cms:route-changed`, etc.) to nudge the debug bridge
 * to re-render when the context changes.
 */
import {
  Collector,
  type CollectorContext,
  type CollectorManifest,
  type CollectorSnapshot,
} from '@quazardous/qddebug'
import type { Cms } from 'qdcms'

const WATCHED_SIGNALS = [
  'cms:stack-changed',
  'cms:route-changed',
  'cms:auth-changed',
  'cms:tenant-changed',
  'locale:changed',
] as const

export class CmsContextCollector extends Collector {
  static override collectorName = 'cms-context'
  static override records = false

  private _cms: Cms | null = null
  private _unsubs: Array<() => void> = []

  protected override _doInstall(ctx: CollectorContext): void {
    this._cms = (ctx as { cms?: Cms }).cms ?? null
    if (!this._cms) {
      console.warn('[CmsContextCollector] no `cms` in install context — bridge will only show empty state')
      return
    }
    const signals = this._cms.signals
    for (const name of WATCHED_SIGNALS) {
      this._unsubs.push(
        signals.on(name, () => {
          this.notifyChange()
        })
      )
    }
  }

  protected override _doUninstall(): void {
    for (const off of this._unsubs) off()
    this._unsubs = []
  }

  override describe(): CollectorManifest {
    return {
      name: this.name,
      records: false,
      summary:
        'Live snapshot of CmsContext: navigation stack, route, locale, auth, tenant. Re-emits on every cms:* signal.',
      stateShape: {
        route: 'string',
        params: 'Record<string, string>',
        query: 'Record<string, string|string[]>',
        stack: 'ContentStackLevel[]',
        locale: 'string?',
        tenant: 'string?',
        auth: '{ isAuthenticated, roles, userId? }',
      },
      actions: this._builtinActionManifests(),
    }
  }

  override snapshot(): CollectorSnapshot {
    const ctx = this._cms?.context ?? null
    return {
      name: this.name,
      entries: [],
      count: 0,
      unseen: 0,
      state: ctx
        ? {
            route: ctx.route,
            params: { ...ctx.params },
            query: { ...ctx.query },
            stack: ctx.stack.map((l) => ({ ...l })),
            locale: ctx.locale ?? null,
            tenant: ctx.tenant ?? null,
            auth: { ...ctx.auth },
          }
        : { error: 'no cms in install context' },
    }
  }
}
