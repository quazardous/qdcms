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
