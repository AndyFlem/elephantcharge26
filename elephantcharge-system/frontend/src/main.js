/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

// Config
import appConfig from '@/config'
//console.log(appConfig)
//const config = {}
const app = createApp(App)

registerPlugins(app, appConfig)

app.mount('#app')
