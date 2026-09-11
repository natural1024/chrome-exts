import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

// Vite entry.
// @crxjs handles manifest emission, HMR wiring for popup/options pages,
// and hashing of the background service worker path. We only need to
// register the Vue plugin and point @crxjs at the manifest config.
export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // MV3 service workers accept modern JS; no legacy target needed.
    target: 'esnext',
  },
  server: {
    port: 5173,
    strictPort: true,
    // @crxjs recommends this for stable HMR sockets during extension dev.
    hmr: { port: 5173 },
  },
});
