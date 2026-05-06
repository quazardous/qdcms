/**
 * cms-instance.ts — bare CMS singleton, isolated from any block import.
 *
 * Why a separate file: the demo's blocks consume `services.ts`
 * (`useDemoEntity`/`useDemoCollection`), which itself reads
 * `cms.signals` to pre-bind the SignalBus. If `cms.ts` (which imports
 * blocks) were the source of `cms`, blocks → services → cms.ts would
 * close a circular import and hit a TDZ on `cms` at module load.
 *
 * Splitting the bare instance out breaks the cycle: services.ts
 * imports here (no further imports), blocks import services, cms.ts
 * imports here AND the blocks. No cycle.
 *
 * IoC: the SignalBus comes from the shared shell (`./shell/signals`),
 * NOT from `createCms`'s default factory. This way qdadm — which
 * receives the same bus through its Orchestrator — sees the same
 * events as qdcms blocks. Entity mutations from the admin zone
 * propagate to front blocks (auto-refresh) and vice versa, without
 * either framework knowing about the other.
 */

import { createCms, DefaultPageComposer } from 'qdcms'
import { signals } from './signals'

export const cms = createCms({
  signals,
  composer: (blocks, placements, layouts) =>
    new DefaultPageComposer(blocks, placements, {
      layouts,
      resolveLayout: (ctx) => {
        const top = ctx.stack[ctx.stack.length - 1]
        if (top?.type === 'page' && top.name === 'home') return 'landing'
        return 'default'
      },
    }),
})
