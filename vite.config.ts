import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { ssamExport } from 'vite-plugin-ssam-export';
import { ssamFfmpeg } from 'vite-plugin-ssam-ffmpeg';
import { ssamGit } from 'vite-plugin-ssam-git';
import { ssamTimelapse } from 'vite-plugin-ssam-timelapse';

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
    {
      name: 'custom-server',
      configureServer(server) {
        server.middlewares.use('/export', (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          server.hot.send('mcp:export');
          server.hot.on('ssam:export', (data) => {
            res.end(JSON.stringify(data));
          });
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
