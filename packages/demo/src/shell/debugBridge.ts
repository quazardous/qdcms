/**
 * Shared DebugBridge — single dispatcher for ALL collectors,
 * regardless of source (qcms / qdadm). Cross-zone consistency: a
 * developer sees the same set of panels (Errors / Signals / Toasts /
 * Zones / Auth / Entities / Router / i18n / Context / Composed)
 * everywhere, instead of two zone-specific bars with different
 * subsets.
 *
 * IoC stance: the demo (host shell) owns the bridge and the install
 * timing. qcms registers its collectors via `addQcmsCollectors()`;
 * qdadm registers via the Kernel option `debugBar.bridge`. After both
 * have registered, the bootstrap calls `bridge.install(mergedCtx)`
 * once with a context that carries everything any collector needs
 * (signals, cms, zones, router, i18n, …). Single install per
 * collector — no double-attach of event handlers.
 */

import { createDebugBridge } from '@quazardous/qddebug'

export const debugBridge = createDebugBridge({ enabled: true })
