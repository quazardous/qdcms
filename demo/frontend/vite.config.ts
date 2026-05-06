import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Base path is env-driven so local dev stays at "/" while CI builds the
// site under the GitHub Pages project subpath. Set in CI:
//   BASE_PATH=/qdcms/ npm run build

// qddebug + qdcore are workspace `file:` links to a sibling repo (qdadm).
// Vite's default fs allowlist is the project root + the workspace root; the
// linked package's transitive deps (e.g. primeicons CSS + woff fonts) live
// in qdadm/node_modules, which Vite refuses to serve unless we whitelist it.
const here = fileURLToPath(new URL('.', import.meta.url))
const qdadmRoot = resolve(here, '../../../qdadm')

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
  },
  // Opt into Sass's modern compiler API (`sass-embedded`) instead of
  // the legacy JS API. Without this Vite spams a deprecation warning
  // on every .scss import (qdadm/styles ships .scss). The package is
  // already a dev dep.
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
  server: {
    fs: {
      allow: [resolve(here, '../..'), qdadmRoot],
    },
    // Classic-backend mode : when VITE_QDCMS_BACKEND_MODE=remote, the
    // SPA's in-tab bridge is dropped from the bundle (see main.ts)
    // and `/api/qdcms/*` is forwarded to the demo Node server. Default
    // target picks up `VITE_QDCMS_API_URL` (`.env.example`); falls
    // back to localhost:5181 (the server's default port).
    proxy:
      process.env.VITE_QDCMS_BACKEND_MODE === 'remote'
        ? {
            '/api/qdcms': {
              target:
                process.env.VITE_QDCMS_API_URL ?? 'http://localhost:5181',
              changeOrigin: true,
            },
          }
        : undefined,
  },
})
