/**
 * Register qcms-side debug collectors on the shared bridge.
 *
 * qdadm's DebugModule already provides Errors / Signals / Toasts /
 * Zones / Auth / Entities / Router / i18n. qcms only contributes its
 * own ones: cms-context (current Cms snapshot) and composed-page
 * (last composed page from the composer). No install — the host
 * shell installs the bridge once with a merged context.
 */
import type { DebugBridge } from '@quazardous/qddebug'
import type { Cms } from 'qdcms'
import { CmsContextCollector } from './CmsContextCollector'
import { ComposedPageCollector } from './ComposedPageCollector'

export function addQcmsCollectors(bridge: DebugBridge, _cms: Cms): void {
  bridge.addCollector(new CmsContextCollector())
  bridge.addCollector(new ComposedPageCollector())
}
