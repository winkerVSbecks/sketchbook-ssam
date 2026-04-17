import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { ssamExport } from 'vite-plugin-ssam-export';
import { ssamFfmpeg } from 'vite-plugin-ssam-ffmpeg';
import { ssamGit } from 'vite-plugin-ssam-git';
import { ssamTimelapse } from 'vite-plugin-ssam-timelapse';
import { ssamPenplot } from './src/plugins/vite-plugin-ssam-penplot';

export default defineConfig({
  base: './',
  plugins: [
    glsl({
      warnDuplicatedImports: false,
    }),
    ssamExport(),
    ssamGit(),
    ssamFfmpeg(),
    ssamTimelapse(),
    ssamPenplot(),
    {
      name: 'custom-server',
      configureServer(server) {
        server.middlewares.use('/export', (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          const handler = (data: unknown) => {
            clearTimeout(timer);
            server.hot.off('ssam:export', handler);
            res.end(JSON.stringify(data));
          };
          const timer = setTimeout(() => {
            server.hot.off('ssam:export', handler);
            res.statusCode = 504;
            res.end(
              JSON.stringify({
                error: 'export timed out — is mcp:export wired up in the sketch?',
              }),
            );
          }, 10_000);
          server.hot.on('ssam:export', handler);
          server.hot.send('mcp:export');
        });
      },
    },
  ],
  build: {
    outDir: './dist',
    assetsDir: '.',
    rollupOptions: {
      //
    },
  },
  define: {
    // By default, Vite doesn't include shims for NodeJS/
    // necessary for segment analytics lib to work
    global: {},
  },
});
