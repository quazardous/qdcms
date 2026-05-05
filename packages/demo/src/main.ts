/**
 * main.ts — infra entry (the Symfony `index.php` of this app).
 *
 * INFRA, not business. This file answers "how does the app boot?",
 * never "what is the app about?". Business config lives in
 * `qdcms.config.ts`; this file just plugs it into the runtime.
 *
 * Two technical responsibilities, kept ultra-thin on purpose:
 *
 *   1. SCOPE OF THE BUNDLE — what's compiled into this entry point?
 *      Today the demo ships as a single bundle containing only the
 *      public site (`App.vue`). When admin lands, the choice happens
 *      HERE: either keep one bundle and `import './admin/register'`
 *      synchronously, or split into a `main-admin.ts` entry. Either
 *      way, `bootstrap.ts` and `qdcms.config.ts` stay unchanged.
 *
 *   2. ROOT COMPONENT — which App component to mount.
 *
 * Everything else (declarative config, wiring, env reading) lives in
 * the layers below. Resist the urge to grow this file.
 */

import { bootstrapApp } from './bootstrap'
import App from './App.vue'
import config from './qdcms.config'
import './style.css'

bootstrapApp({ App, config }).then((app) => app.mount('#app'))
