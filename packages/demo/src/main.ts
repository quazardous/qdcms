import { createApp } from 'vue'
import App from './App.vue'
import { router, buildUrl } from './router'
import { cms } from './cms'
import './style.css'

// Register the URL builder before mounting so any block rendered on first
// paint can call `useLocaleUrl()` / `<LocaleLink>` without an empty-builder
// throw. Hardcoded paths are forbidden in qdcms code — every link goes
// through this builder.
cms.setUrlBuilder(buildUrl)

const app = createApp(App)
app.use(router)
cms.install(app)
app.mount('#app')
