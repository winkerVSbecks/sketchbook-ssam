import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Builds only the client filter island into dist/. Pages are prerendered
// separately (src/prerender.tsx) after this runs.
export default defineConfig({
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(here, 'src/islands/filter.ts'),
      output: {
        entryFileNames: 'filter.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
