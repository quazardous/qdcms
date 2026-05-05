/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 'browser' (in-tab fake backend) | 'remote' (real HTTP backend). */
  readonly VITE_QDCMS_BACKEND_MODE?: 'browser' | 'remote'
  /** Base URL of the real backend when VITE_QDCMS_BACKEND_MODE=remote. */
  readonly VITE_QDCMS_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// qdadm imports `pluralize` (plain JS, no bundled .d.ts). Its own
// vite-env.d.ts declares this module but isn't visible from the demo's
// tsconfig — re-declare the minimum surface here so vue-tsc on the
// demo doesn't error inside transitively-walked qdadm sources.
declare module 'pluralize' {
  interface PluralizeFn {
    (word: string, count?: number, inclusive?: boolean): string
    singular(word: string): string
    plural(word: string, count?: number, inclusive?: boolean): string
    isPlural(word: string): boolean
    isSingular(word: string): boolean
  }
  const pluralize: PluralizeFn
  export default pluralize
}
