/**
 * Bootstrap the qdcms demo debug bridge.
 *
 * Registers:
 * - ErrorCollector / SignalCollector (generic, from qddebug)
 * - CmsContextCollector / ComposedPageCollector (qdcms-specific, in this folder)
 *
 * Returns the `bridge` ready to be passed to `<DebugBar :bridge>`.
 */
import { createDebugBridge, ErrorCollector, SignalCollector } from '@quazardous/qddebug'
import type { Cms } from 'qdcms'
import { CmsContextCollector } from './CmsContextCollector'
import { ComposedPageCollector } from './ComposedPageCollector'

export function createDemoDebug(cms: Cms): ReturnType<typeof createDebugBridge> {
  const bridge = createDebugBridge({ enabled: true })

  bridge.addCollector(new ErrorCollector({ maxEntries: 50 }))
  bridge.addCollector(new SignalCollector({ maxEntries: 100 }))
  bridge.addCollector(new CmsContextCollector())
  bridge.addCollector(new ComposedPageCollector())

  bridge.install({ signals: cms.signals, cms })

  return bridge
}
