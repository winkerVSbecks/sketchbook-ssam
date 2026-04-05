import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const defaultOptions = {
  outDir: './output',
};

const prefix = () => {
  const time = new Date().toLocaleTimeString();
  return `${time} [ssam-penplot]`;
};

export const ssamPenplot = (opts: { outDir?: string } = {}): Plugin => ({
  name: 'vite-plugin-ssam-penplot',
  apply: 'serve',
  configureServer(server) {
    const { outDir } = Object.assign({}, defaultOptions, opts);

    server.hot.on('ssam:export-svg', (data, client) => {
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
        console.log(`${prefix()} created directory at ${path.resolve(outDir)}`);
      }

      const { svg, filename } = data;
      const filePath = path.join(outDir, `${filename}.svg`);

      fs.promises
        .writeFile(filePath, svg, 'utf-8')
        .then(() => {
          const msg = `${prefix()} ${filePath} exported`;
          console.log(msg);
          client.send('ssam:log', { msg });
        })
        .catch((err) => {
          const msg = `${prefix()} ${err}`;
          console.error(msg);
          client.send('ssam:warn', { msg });
        });
    });
  },
});
