import type {
  CmsContext,
  ComposedPage,
  PageComposer,
  Placement,
  PlacementProps,
  ResolvedBlock,
} from '../types'
import { matchConditions } from '../blocks/matchers'
import type { BlockRegistry } from '../blocks/BlockRegistry'
import type { PlacementRegistry } from '../blocks/PlacementRegistry'
import type { LayoutRegistry } from '../layouts/LayoutRegistry'

export interface DefaultPageComposerOptions {
  /**
   * Layout chooser. Receives the context and returns a layout name.
   * Default: returns 'default'.
   */
  resolveLayout?: (ctx: CmsContext) => string
  /**
   * Optional layout registry — when provided, the composer warns at dev time
   * if a placement targets a region not declared by the active layout.
   * No effect in production.
   */
  layouts?: LayoutRegistry
}

/**
 * Default composer: iterates placements, evaluates conditions against context,
 * groups matched blocks by region, sorts by weight.
 *
 * Replace freely — see the `PageComposer` interface in `types.ts`.
 */
export class DefaultPageComposer implements PageComposer {
  constructor(
    private blocks: BlockRegistry,
    private placements: PlacementRegistry,
    private options: DefaultPageComposerOptions = {}
  ) {}

  compose(ctx: CmsContext): ComposedPage {
    const layout = this.options.resolveLayout?.(ctx) ?? 'default'
    const regions: Record<string, ResolvedBlock[]> = {}

    for (const placement of this.placements.all()) {
      if (!matchConditions(placement.when, ctx)) continue

      const def = this.blocks.get(placement.block)
      if (!def) {
        console.warn(`[qdcms] placement references unknown block "${placement.block}"`)
        continue
      }

      this.warnIfRegionUnknown(layout, placement)

      const props = resolveProps(placement.props, ctx)

      const resolved: ResolvedBlock = {
        id: placement.id ?? `${placement.block}-${placement.region}`,
        block: placement.block,
        component: def.component,
        props,
        weight: placement.weight ?? 0,
        scope: def.scope,
      }

      ;(regions[placement.region] ??= []).push(resolved)
    }

    for (const region of Object.keys(regions)) {
      regions[region].sort((a, b) => a.weight - b.weight)
    }

    return { layout, regions }
  }

  private warnedRegions = new Set<string>()

  private warnIfRegionUnknown(layout: string, placement: Placement) {
    if (!this.options.layouts) return
    if (!this.options.layouts.has(layout)) return
    if (this.options.layouts.exposesRegion(layout, placement.region)) return
    const key = `${layout}::${placement.region}::${placement.id ?? placement.block}`
    if (this.warnedRegions.has(key)) return
    this.warnedRegions.add(key)
    console.warn(
      `[qdcms] placement of block "${placement.block}" targets region "${placement.region}" ` +
        `which is not declared by layout "${layout}". The block will not render.`
    )
  }
}

/**
 * Convenience: a composer that delegates to a remote source (your API).
 * Useful when an admin UI persists composition in a database.
 */
export class ApiPageComposer implements PageComposer {
  constructor(private fetcher: (ctx: CmsContext) => Promise<ComposedPage>) {}

  compose(ctx: CmsContext): Promise<ComposedPage> {
    return this.fetcher(ctx)
  }
}

/**
 * Hybrid: take base placements from a primary composer (e.g. registry-based),
 * then overlay matches from a secondary (e.g. tenant-specific from API).
 *
 * Layout precedence: the overlay's layout wins if it returns a non-empty
 * value, otherwise the base's layout is used.
 */
export class OverlayPageComposer implements PageComposer {
  constructor(
    private base: PageComposer,
    private overlay: PageComposer
  ) {}

  async compose(ctx: CmsContext): Promise<ComposedPage> {
    const [a, b] = await Promise.all([
      Promise.resolve(this.base.compose(ctx)),
      Promise.resolve(this.overlay.compose(ctx)),
    ])
    const regions: Record<string, ResolvedBlock[]> = {}
    for (const r of new Set([...Object.keys(a.regions), ...Object.keys(b.regions)])) {
      regions[r] = [...(a.regions[r] ?? []), ...(b.regions[r] ?? [])].sort(
        (x, y) => x.weight - y.weight
      )
    }
    return { layout: b.layout || a.layout, regions }
  }
}

function resolveProps(
  props: Placement['props'],
  ctx: CmsContext
): PlacementProps {
  if (props == null) return {}
  if (typeof props === 'function') return props(ctx)
  return props
}

// Re-export for sub-module ergonomics
export type { Placement }
