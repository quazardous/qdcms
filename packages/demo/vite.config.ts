import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Base path is env-driven so local dev stays at "/" while CI builds the
// site under the GitHub Pages project subpath. Set in CI:
//   BASE_PATH=/qdcms/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
  },
})
