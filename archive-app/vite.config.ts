import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerServer } from './src/runner/plugin.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Builds only the client islands into dist/. Pages are prerendered separately
// (src/prerender.tsx) after this runs.
//
// runnerServer only touches `vite preview` (`npm run archive:dev`), where it
// backs the play button; it contributes nothing to the build, so the deployed
// site is unchanged by it.
export default defineConfig({
  plugins: [runnerServer()],
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(here, 'src/islands/filter.ts'),
      output: {
        entryFileNames: 'filter.js',
        // filter.ts lazily imports the runner island; name that chunk after
        // its module rather than a hash, so prerender can stamp it.
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
