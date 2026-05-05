import { createApp } from 'vue'
import { installEmulator } from '@quazardous/qdcms-api-emulator'
import App from './App.vue'
import { router, buildUrl } from './router'
import { cms } from './cms'
import { createDemoBackend } from './demo-backend'
import { realizationSeed } from './data/realizations'
import './style.css'

// Register the URL builder before mounting so any block rendered on first
// paint can call `useLocaleUrl()` / `<LocaleLink>` without an empty-builder
// throw. Hardcoded paths are forbidden in qdcms code — every link goes
// through this builder.
cms.setUrlBuilder(buildUrl)

// ─── Demo-only fake backend ─────────────────────────────────────────
// The demo deploys as a static SPA (no server). We mount a JS-heap +
// localStorage "backend" that honours the qdcms HTTP contract just
// enough for blocks to use ApiFrontendStorage as if a real server
// existed. See packages/demo/src/demo-backend/.
const demoBackend = createDemoBackend({
  plugins: [
    {
      id: '@quazardous/qdcms-plugin-core',
      version: '0.1.0',
      prefix: 'core',
      title: 'Core',
      tables: ['user', 'session'],
    },
    // Demo-only "plugin" — exposes the realization entity that the
    // demo's portfolio blocks consume. In a real deployment this
    // would be a proper qdcms plugin npm package; for the demo it's
    // declared inline.
    {
      id: 'demo',
      version: '0.1.0',
      prefix: 'demo',
      title: 'Demo content',
      tables: ['realization'],
    },
  ],
  seed: {
    user: [
      {
        id: 'demo-user-1',
        email: 'alice@flowercraft.demo',
        name: 'Alice',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    realization: realizationSeed,
  },
  // localStorage by default — survives reload + browser restart
})
installEmulator({ backend: demoBackend })

const app = createApp(App)
app.use(router)
cms.install(app)
app.mount('#app')
