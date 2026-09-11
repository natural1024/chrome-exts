import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

// Vite entry.
// @crxjs handles:
//   - copying the manifest and hashing background / content script paths
//   - wiring HMR for popup and options pages during `vite dev`
//   - emitting icons referenced in the manifest into dist/
//
// Kept intentionally minimal — we don't ship any content scripts and the
// popup/options pages are declared through the manifest, so no additional
// rollup input config is needed.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Chrome MV3 allows top-level await in service workers via ES modules;
    // no polyfilling gymnastics required.
    target: 'esnext',
  },
  server: {
    port: 5173,
    strictPort: true,
    // @crxjs recommends this for stable HMR sockets during extension dev.
    hmr: { port: 5173 },
  },
});
