import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewServer } from './src/review/server/plugin.ts';

const here = dirname(fileURLToPath(import.meta.url));

// The Light Table — local-only review tool for the repo's output/ directory
// (`npm run review`). Dev server only: this config is never built and nothing
// under src/review/ ships in dist/ or the deployed archive.
export default defineConfig({
  root: resolve(here, 'src/review'),
  plugins: [reviewServer()],
  server: {
    // Own port so it never trades places with the sketch runner on 5173.
    port: 5180,
    open: true,
  },
});
