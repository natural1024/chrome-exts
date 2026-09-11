import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// Vite entry.
// @analogjs/vite-plugin-angular runs the Angular compiler (JIT/AOT) so we can
// author standalone components in .ts / .component.ts files without the
// Angular CLI. @crxjs handles MV3 manifest emission, service worker wiring,
// and HMR for popup/options pages.
export default defineConfig({
  plugins: [
    // Analog defaults to looking for `tsconfig.app.json` (Angular-CLI style);
    // we keep a single flat `tsconfig.json`, so point it there explicitly.
    angular({ tsconfig: './tsconfig.json' }),
    crx({ manifest }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext', // MV3 SW accepts modern JS.
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
