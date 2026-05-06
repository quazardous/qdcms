/**
 * @quazardous/qdcms-backend/browser — in-browser flavour of the
 * qdcms backend. No MikroORM, no node_modules loader, no SQL.
 * Honours the same HTTP contract as the Node `createBackend`.
 *
 * Use it together with `qdcms-api-emulator` to run a qdcms backend
 * fully inside a browser tab (static-site demos, offline-first,
 * unit tests).
 */

export {
  createBrowserBackend,
  type BrowserBackend,
} from './createBrowserBackend'
export {
  MemoryStore,
  type Row,
  type Table,
  type Snapshot,
} from './MemoryStore'
export {
  type BrowserPlugin,
  type BrowserSeed,
  type CreateBrowserBackendOptions,
} from './types'
