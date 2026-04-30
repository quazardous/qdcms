import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { cms } from './cms'
import './style.css'

const app = createApp(App)
app.use(router)
cms.install(app)
app.mount('#app')
