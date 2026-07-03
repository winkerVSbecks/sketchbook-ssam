/**
 * Node side of the Light Table (`npm run review`). A Vite dev-server plugin
 * that mounts, on top of the client app in ../:
 *
 *   GET  /api/index          — top-level media files in <repo>/output
 *   GET  /api/keepers        — starred filenames (persisted JSON)
 *   POST /api/keepers        — { name, kept } toggle
 *   POST /api/reveal         — { name } → reveal the file in Finder
 *   GET  /api/progress       — thumbnail cache progress { done, total }
 *   GET  /output/<name>      — original file, with Range support for video
 *   GET  /thumbs/<name>      — 320px webp thumbnail, generated on demand
 *
 * Thumbnails and keepers live in <repo>/output/.review/ (output/ is
 * gitignored). A background queue prewarms missing thumbnails at low
 * concurrency; on-demand requests bypass the queue.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const outputDir = join(repoRoot, 'output');
const reviewDir = join(outputDir, '.review');
const thumbsDir = join(reviewDir, 'thumbs');
const keepersPath = join(reviewDir, 'keepers.json');
const failedPath = join(reviewDir, 'failed.json');

const THUMB_SIZE = 320;
const PREWARM_CONCURRENCY = 3;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

const isMedia = (name: string) =>
  IMAGE_EXT.has(extOf(name)) || VIDEO_EXT.has(extOf(name));

async function listMedia(): Promise<string[]> {
  const entries = await readdir(outputDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && isMedia(e.name))
    .map((e) => e.name);
}

/** Resolve a client-supplied filename to a real path inside output/, or null.
 * Names come from our own index, but never trust the round trip. */
function safeOutputPath(name: string): string | null {
  if (name.includes('/') || name.includes('\\') || name.startsWith('.')) return null;
  const full = join(outputDir, name);
  return resolve(full).startsWith(resolve(outputDir) + '/') ? full : null;
}

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
  res.end(JSON.stringify(data));
}

/** Stream a file with HTTP Range support — required for <video> seeking.
 * Stepping quickly past videos aborts requests constantly; wire both
 * directions so an abort tears the stream down instead of leaking or
 * crashing on an unhandled stream error. */
function pipeTo(res: ServerResponse, path: string, opts?: { start: number; end: number }): void {
  const stream = createReadStream(path, opts);
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

async function sendFile(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const st = await stat(path);
  const type = CONTENT_TYPES[extOf(path)] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache');

  const range = req.headers.range;
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    const start = match[1] ? parseInt(match[1], 10) : st.size - parseInt(match[2]!, 10);
    const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), st.size - 1) : st.size - 1;
    if (start >= st.size || start < 0 || start > end) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${st.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
    res.setHeader('Content-Length', end - start + 1);
    pipeTo(res, path, { start, end });
  } else {
    res.setHeader('Content-Length', st.size);
    pipeTo(res, path);
  }
}

// ---------- thumbnails ----------

/** Square cover-crop thumbnail, mirroring the archive's 1:1 grammar. */
async function generateThumb(name: string, dest: string): Promise<void> {
  const src = join(outputDir, name);
  const tmp = `${dest}.tmp-${process.pid}`;
  let source: Buffer | string = src;
  if (VIDEO_EXT.has(extOf(name))) {
    // First frame as PNG on stdout; sharp does the resize + webp encode so we
    // don't depend on the bundled ffmpeg having libwebp.
    const { stdout } = await execFileAsync(
      ffmpeg.path,
      ['-hide_banner', '-loglevel', 'error', '-i', src, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
    );
    if (stdout.length === 0) throw new Error('ffmpeg produced no frame');
    source = stdout;
  }
  await sharp(source)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(tmp);
  await rename(tmp, dest);
}

export function reviewServer(): Plugin {
  const inFlight = new Map<string, Promise<void>>();
  const failed = new Set<string>();
  const progress = { done: 0, total: 0 };

  // Corrupt exports (truncated recordings, etc.) fail thumbnailing every
  // time; remember them by mtime in failed.json so restarts don't re-decode
  // them — and re-spew ffmpeg's stderr — while a re-exported file retries.
  let failedRecords: Record<string, number> = {};
  let failedSave = Promise.resolve();

  const thumbPath = (name: string) => join(thumbsDir, `${name}.webp`);

  const markFailed = (name: string, mtimeMs: number | null) => {
    if (!failed.has(name)) {
      failed.add(name);
      console.warn(
        `[review] no thumbnail for ${name} — file is unreadable; skipping until it changes`,
      );
    }
    if (mtimeMs !== null && failedRecords[name] !== mtimeMs) {
      failedRecords[name] = mtimeMs;
      failedSave = failedSave
        .then(() => writeFile(failedPath, JSON.stringify(failedRecords, null, 2)))
        .catch(() => {});
    }
  };

  /** Known-bad and unchanged since the failure? (A changed file retries.) */
  const isKnownFailure = async (name: string): Promise<boolean> => {
    if (failed.has(name)) return true;
    const recorded = failedRecords[name];
    if (recorded === undefined) return false;
    try {
      const st = await stat(join(outputDir, name));
      if (st.mtimeMs === recorded) {
        failed.add(name);
        return true;
      }
      delete failedRecords[name];
      return false;
    } catch {
      return true;
    }
  };

  const tryThumb = async (name: string): Promise<boolean> => {
    if (await isKnownFailure(name)) return false;
    try {
      await ensureThumb(name);
      return true;
    } catch {
      const st = await stat(join(outputDir, name)).catch(() => null);
      markFailed(name, st?.mtimeMs ?? null);
      return false;
    }
  };

  const ensureThumb = (name: string): Promise<void> => {
    const existing = inFlight.get(name);
    if (existing) return existing;
    const job = (async () => {
      const dest = thumbPath(name);
      try {
        await stat(dest);
        return; // already cached
      } catch {
        /* generate below */
      }
      await generateThumb(name, dest);
    })().finally(() => inFlight.delete(name));
    inFlight.set(name, job);
    return job;
  };

  /** Prewarm every missing thumbnail in the background so the contact sheet
   * fills in without waiting on scroll. On-demand requests still win: they
   * run immediately via ensureThumb's in-flight map. */
  async function prewarm(): Promise<void> {
    const names = await listMedia();
    progress.total = names.length;
    const cached = new Set(
      (await readdir(thumbsDir)).filter((n) => n.endsWith('.webp')),
    );
    const missing = names.filter((n) => !cached.has(`${n}.webp`));
    progress.done = names.length - missing.length;

    const queue = [...missing];
    const worker = async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        await tryThumb(name);
        progress.done++;
      }
    };
    await Promise.all(Array.from({ length: PREWARM_CONCURRENCY }, worker));
    const skipped = missing.filter((n) => failed.has(n)).length;
    console.log(
      `[review] thumbnail cache ready (${progress.done}/${progress.total}` +
        (skipped ? `, ${skipped} unreadable skipped` : '') +
        ')',
    );
  }

  async function readKeepers(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await readFile(keepersPath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : [];
    } catch {
      return [];
    }
  }

  return {
    name: 'review-server',
    async configureServer(server) {
      await mkdir(thumbsDir, { recursive: true });
      try {
        const parsed = JSON.parse(await readFile(failedPath, 'utf8'));
        if (parsed && typeof parsed === 'object') failedRecords = parsed;
      } catch {
        /* no failure records yet */
      }
      void prewarm().catch((err) => console.error(`[review] prewarm failed: ${err}`));

      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = url.pathname;

        const handle = async () => {
          if (route === '/api/index' && req.method === 'GET') {
            const files = await listMedia();
            sendJson(res, { root: outputDir, files });
            return;
          }

          if (route === '/api/progress' && req.method === 'GET') {
            sendJson(res, progress);
            return;
          }

          if (route === '/api/keepers' && req.method === 'GET') {
            sendJson(res, await readKeepers());
            return;
          }

          if (route === '/api/keepers' && req.method === 'POST') {
            const { name, kept } = JSON.parse(await readBody(req));
            if (typeof name !== 'string' || !safeOutputPath(name)) {
              sendJson(res, { error: 'bad name' }, 400);
              return;
            }
            const keepers = new Set(await readKeepers());
            if (kept) keepers.add(name);
            else keepers.delete(name);
            await writeFile(keepersPath, JSON.stringify([...keepers].sort(), null, 2));
            sendJson(res, { ok: true });
            return;
          }

          if (route === '/api/reveal' && req.method === 'POST') {
            const { name } = JSON.parse(await readBody(req));
            const path = typeof name === 'string' ? safeOutputPath(name) : null;
            if (!path) {
              sendJson(res, { error: 'bad name' }, 400);
              return;
            }
            if (process.platform === 'darwin') {
              await execFileAsync('open', ['-R', path]);
              sendJson(res, { ok: true });
            } else {
              sendJson(res, { error: 'reveal is macOS-only' }, 501);
            }
            return;
          }

          if (route.startsWith('/output/') && req.method === 'GET') {
            const name = decodeURIComponent(route.slice('/output/'.length));
            const path = safeOutputPath(name);
            if (!path) {
              res.statusCode = 404;
              res.end();
              return;
            }
            await sendFile(req, res, path);
            return;
          }

          if (route.startsWith('/thumbs/') && req.method === 'GET') {
            const name = decodeURIComponent(route.slice('/thumbs/'.length));
            if (!safeOutputPath(name) || !(await tryThumb(name))) {
              res.statusCode = 404;
              res.end();
              return;
            }
            await sendFile(req, res, thumbPath(name));
            return;
          }

          next();
        };

        handle().catch((err) => {
          console.error(`[review] ${route}: ${err}`);
          if (!res.headersSent) sendJson(res, { error: String(err) }, 500);
          else res.end();
        });
      });
    },
  };
}
