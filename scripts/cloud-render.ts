#!/usr/bin/env tsx
/**
 * cloud-render — drive a headless render of an ssam sketch inside an ephemeral
 * Linux container (claude.ai/code web sandbox). Long-lived state is just the
 * Vite child process and .cloud-render/vite.pid. Chromium is created and killed
 * per invocation.
 *
 * Usage:
 *   npm run cloud:render -- <sketchPath>   # e.g. sketches/siep-van-den-berg/no-250
 *   npm run cloud:stop                     # tear down the background Vite
 */

import { spawnSync, execSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  existsSync,
  openSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import * as lockfile from 'proper-lockfile';
import { chromium } from 'playwright-core';
// The Vite child-process lifecycle is shared with the archive site's play
// button — see scripts/vite-runner.ts.
import {
  PROJECT_ROOT,
  RUNNER_DIR as CLOUD_DIR,
  VITE_PORT,
  ensureVite,
  stopVite as stopRunner,
} from './vite-runner.ts';

const INSTALL_LOG_FILE = join(CLOUD_DIR, 'install.log');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output');
const BROWSERS_PATH = join(CLOUD_DIR, 'browsers');

// The headless page size. Sketches that declare `dimensions` are unaffected —
// their canvas has a fixed backing store and /export reads the canvas, not the
// window — but a sketch with no `dimensions` is sized by ssam to the viewport,
// so this is the frame every full-screen sketch gets archived in. Landscape,
// because full-screen sketches are composed for a screen, not a square.
const HEADLESS_VIEWPORT = { width: 1600, height: 1000 };

const READY_FLAG_TIMEOUT_MS = 15_000;
const EXPORT_TIMEOUT_MS = 12_000;
const LOCK_STALE_MS = 60_000;

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
}

function ensureDirs(): void {
  mkdirSync(CLOUD_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// The sandbox pre-installs playwright browser binaries at /opt/pw-browsers, but the
// revision may not match playwright-core's expected revision. Detect any usable binary
// there directly so we can skip the (blocked) download on first use.
function findSystemChromiumExecutable(): string | null {
  const searchBase = '/opt/pw-browsers';
  if (!existsSync(searchBase)) return null;
  try {
    const found = execSync(
      `find "${searchBase}" \\( -name "headless_shell" -o -name "chrome-headless-shell" \\) -type f 2>/dev/null | head -1`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return found && existsSync(found) ? found : null;
  } catch {
    return null;
  }
}

function findHeadlessShellPath(): string | null {
  if (!existsSync(BROWSERS_PATH)) return null;
  let dirs: string[];
  try {
    dirs = readdirSync(BROWSERS_PATH).filter((e) =>
      e.startsWith('chromium_headless_shell-'),
    );
  } catch {
    return null;
  }
  if (dirs.length === 0) return null;
  dirs.sort();
  const versionDir = dirs[dirs.length - 1];
  let platformDirs: string[];
  try {
    platformDirs = readdirSync(join(BROWSERS_PATH, versionDir)).filter((e) =>
      e.startsWith('chrome-headless-shell-'),
    );
  } catch {
    return null;
  }
  if (platformDirs.length === 0) return null;
  const binary =
    process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const candidate = join(BROWSERS_PATH, versionDir, platformDirs[0], binary);
  return existsSync(candidate) ? candidate : null;
}

function chromiumExecutableMissing(): boolean {
  if (findSystemChromiumExecutable()) return false;
  return findHeadlessShellPath() === null;
}

function runInstall(): void {
  process.stdout.write('[cloud-render] installing chromium-headless-shell (one-time)…\n');
  const logFd = openSync(INSTALL_LOG_FILE, 'w');
  const result = spawnSync('npm', ['run', 'cloud:install'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['ignore', logFd, logFd],
  });
  if (result.error || result.status !== 0) {
    appendFileSync(
      INSTALL_LOG_FILE,
      `\n[cloud-render] cloud:install exited with status ${result.status}, error: ${result.error?.message ?? 'none'}\n`,
    );
    throw new Error(
      `chromium-headless-shell install failed — see ${INSTALL_LOG_FILE} for details`,
    );
  }
}

async function fetchExport(): Promise<{
  image: string;
  filename: string;
  format: string;
}> {
  const url = `http://localhost:${VITE_PORT}/export`;
  const res = await fetch(url, { signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS) });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`/export returned ${res.status}: ${body}`);
  }
  return (await res.json()) as { image: string; filename: string; format: string };
}

async function renderOnce(sketchPath: string): Promise<string> {
  ensureDirs();
  // Not `adoptForeign` — a render must be of the sketch that was asked for, so
  // an unrecorded server on the runner's port gets replaced rather than reused.
  await ensureVite(sketchPath, {
    log: (message) => process.stderr.write(`[cloud-render] ${message}\n`),
  });

  if (chromiumExecutableMissing()) {
    runInstall();
    if (chromiumExecutableMissing()) {
      throw new Error(
        `chrome-headless-shell still missing after install — see ${INSTALL_LOG_FILE}`,
      );
    }
  }

  const systemExec = findSystemChromiumExecutable();
  const localExec = findHeadlessShellPath();
  const executablePath = systemExec ?? localExec ?? undefined;
  if (systemExec) {
    process.stdout.write(`[cloud-render] using system Chromium: ${systemExec}\n`);
  } else if (localExec) {
    process.stdout.write(`[cloud-render] using local Chromium: ${localExec}\n`);
  }
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  let resultFilename = '';
  try {
    const context = await browser.newContext({ viewport: HEADLESS_VIEWPORT });
    const page = await context.newPage();
    await page.goto(`http://localhost:${VITE_PORT}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.waitForFunction(
      () => (window as { __ssam_ready?: boolean }).__ssam_ready === true,
      undefined,
      { timeout: READY_FLAG_TIMEOUT_MS },
    );
    // Fire the /export call from Node, NOT from inside the page — the HMR-coupled
    // server middleware needs the page-with-handler to be alive, but issuing the
    // HTTP request from inside Chromium would compete with the page's own
    // WebSocket-driven HMR client and risks deadlock.
    const result = await fetchExport();
    resultFilename = result.filename;
  } finally {
    await browser.close().catch(() => {
      /* ignore */
    });
  }

  process.stdout.write(`${JSON.stringify({ filename: resultFilename })}\n`);
  return resultFilename;
}

async function stopVite(): Promise<void> {
  const record = await stopRunner();
  if (!record) {
    process.stdout.write('[cloud-render] no Vite PID recorded — nothing to stop\n');
    return;
  }
  process.stdout.write(`[cloud-render] stopped Vite (was pid ${record.pid})\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === 'stop') {
    await stopVite();
    return;
  }
  const sketchPath = args[0];
  if (!sketchPath) {
    throw new Error(
      'Usage: cloud-render <sketchPath>   (e.g. sketches/siep-van-den-berg/no-250)',
    );
  }
  await renderOnce(sketchPath);
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  ensureDirs();
  // proper-lockfile locks a real path. Use the .cloud-render dir itself.
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(CLOUD_DIR, {
      stale: LOCK_STALE_MS,
      retries: { retries: 30, minTimeout: 200, maxTimeout: 500 },
    });
  } catch (err) {
    throw new Error(`Failed to acquire render lock on ${CLOUD_DIR}: ${String(err)}`);
  }
  const releaseLock = async () => {
    if (!release) return;
    try {
      await release();
    } catch {
      /* release errors are non-fatal */
    }
    release = null;
  };
  const signalHandler = (signal: NodeJS.Signals) => {
    process.stderr.write(`[cloud-render] received ${signal} — releasing lock\n`);
    void releaseLock().finally(() => process.exit(130));
  };
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);
  try {
    return await fn();
  } finally {
    process.removeListener('SIGINT', signalHandler);
    process.removeListener('SIGTERM', signalHandler);
    await releaseLock();
  }
}

withLock(main).catch((err: unknown) => {
  process.stderr.write(
    `[cloud-render] ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
