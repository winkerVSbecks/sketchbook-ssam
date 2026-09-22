/**
 * Node side of the archive's play button (`npm run archive:dev`).
 *
 * A Vite *preview*-server plugin, not a dev-server one: the archive is
 * prerendered and served out of dist/, so preview is the only server in the
 * loop. It mounts:
 *
 *   GET  /api/runner        — what is serving sketches right now
 *   POST /api/runner        — { id, restart? } → ensure a server, return its URL
 *   POST /api/runner/stop   — stop the server we started
 *
 * The process lifecycle lives in scripts/vite-runner.ts, shared with
 * cloud:render so the two cooperate over the runner's port (:6173, not the
 * user's :5173) instead of fighting for it.
 *
 * None of this ships: configurePreviewServer is inert during `vite build`, and
 * the client half (../islands/runner.ts) only loads on localhost.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureVite,
  runnerStatus,
  sketchUrl,
  stopVite,
} from '../../../scripts/vite-runner.ts';
import type { Archive } from '../types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const archivePath = resolve(here, '../../archive.json');

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => res(body));
    req.on('error', rej);
  });
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function runnerServer(): Plugin {
  /** Sketch ids we're willing to run. The client only ever sends ids it read
   *  off our own pages, but the round trip is not to be trusted — this is the
   *  difference between "start a known sketch" and "start whatever you like". */
  let ids: Set<string> | null = null;
  async function knownIds(): Promise<Set<string>> {
    if (!ids) {
      const archive = JSON.parse(await readFile(archivePath, 'utf8')) as Archive;
      ids = new Set(archive.sketches.map((s) => s.id));
    }
    return ids;
  }

  /** Spawning is not reentrant — two fast clicks would race to take the port.
   *  Serialize every mutation through one chain. */
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  }

  return {
    name: 'archive-runner',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (!route.startsWith('/api/runner')) return next();

        const handle = async () => {
          if (route === '/api/runner' && req.method === 'GET') {
            sendJson(res, await runnerStatus());
            return;
          }

          if (route === '/api/runner' && req.method === 'POST') {
            const { id, restart } = JSON.parse((await readBody(req)) || '{}');
            if (typeof id !== 'string' || !(await knownIds()).has(id)) {
              sendJson(res, { error: `unknown sketch: ${String(id)}` }, 400);
              return;
            }
            const result = await serialize(() =>
              ensureVite(id, {
                // A live server can be pointed at any sketch with ?sketch=, so
                // reuse whatever is already up — including a server started by
                // the VS Code task, whose terminal we would otherwise kill out
                // from under the user. `restart` is the opt-in for when that
                // server is wedged.
                anySketch: true,
                force: restart === true,
                log: (message) => console.log(`[runner] ${message}`),
              }),
            );
            sendJson(res, { ...result, url: sketchUrl(id, result.port) });
            return;
          }

          if (route === '/api/runner/stop' && req.method === 'POST') {
            const record = await serialize(() => stopVite());
            sendJson(res, { stopped: record });
            return;
          }

          next();
        };

        handle().catch((err) => {
          console.error(`[runner] ${route}: ${err}`);
          if (!res.headersSent) sendJson(res, { error: String(err) }, 500);
          else res.end();
        });
      });
    },
  };
}
