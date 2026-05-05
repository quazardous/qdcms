/**
 * Shared SignalBus — the single dispatcher used by qdcms, qdadm, and
 * any other framework plugged into this app.
 *
 * IoC stance: the demo (the *shell*) owns the bus. qdcms gets it via
 * `createCms({ signals })`, qdadm gets it via
 * `new Orchestrator({ signals })`. Both see the same events — entity
 * mutations from the admin zone propagate to front blocks
 * (auto-refresh) and vice versa, without either framework needing to
 * know about the other.
 *
 * Why exposed as a module-level singleton: the bus must exist BEFORE
 * `cms-instance.ts` evaluates (which happens at module-load via the
 * blocks → services chain), so a factory function called from
 * bootstrap would be too late.
 */

import { createSignalBus } from '@quazardous/qdcore'

export const signals = createSignalBus()
