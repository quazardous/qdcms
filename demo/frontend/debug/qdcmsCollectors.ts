/**
 * Register qdcms-side debug collectors on the shared bridge.
 *
 * qdadm's DebugModule already provides Errors / Signals / Toasts /
 * Zones / Auth / Entities / Router / i18n. qdcms only contributes its
 * own ones: cms-context (current Cms snapshot) and composed-page
 * (last composed page from the composer). No install — the host
 * shell installs the bridge once with a merged context.
 */
import type { DebugBridge } from '@quazardous/qddebug'
import { CmsContextCollector } from './CmsContextCollector'
import { ComposedPageCollector } from './ComposedPageCollector'

export function addQdcmsCollectors(bridge: DebugBridge): void {
  bridge.addCollector(new CmsContextCollector())
  bridge.addCollector(new ComposedPageCollector())
}
