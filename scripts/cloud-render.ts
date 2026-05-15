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

import { spawn, spawnSync, execSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  appendFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as net from 'node:net';
import * as lockfile from 'proper-lockfile';
import { chromium } from 'playwright-core';

const PROJECT_ROOT = process.cwd();
const CLOUD_DIR = join(PROJECT_ROOT, '.cloud-render');
const VITE_PID_FILE = join(CLOUD_DIR, 'vite.pid');
const VITE_LOG_FILE = join(CLOUD_DIR, 'vite.log');
const INSTALL_LOG_FILE = join(CLOUD_DIR, 'install.log');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output');
const BROWSERS_PATH = join(CLOUD_DIR, 'browsers');

const VITE_PORT = 5173;
const VITE_READY_TIMEOUT_MS = 30_000;
const READY_FLAG_TIMEOUT_MS = 15_000;
const EXPORT_TIMEOUT_MS = 12_000;
const PORT_FREE_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 60_000;

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
}

type VitePidRecord = {
  pid: number;
  sketch: string;
  port: number;
};

function ensureDirs(): void {
  mkdirSync(CLOUD_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function readVitePid(): VitePidRecord | null {
  if (!existsSync(VITE_PID_FILE)) return null;
  try {
    return JSON.parse(readFileSync(VITE_PID_FILE, 'utf8')) as VitePidRecord;
  } catch {
    return null;
  }
}

function writeVitePid(record: VitePidRecord): void {
  writeFileSync(VITE_PID_FILE, JSON.stringify(record, null, 2));
}

function removeVitePid(): void {
  rmSync(VITE_PID_FILE, { force: true });
}

function getProcessCmdline(pid: number): string | null {
  // Linux: /proc/<pid>/cmdline (null-separated argv)
  const procPath = `/proc/${pid}/cmdline`;
  if (existsSync(procPath)) {
    try {
      return readFileSync(procPath, 'utf8').replace(/\0/g, ' ').trim();
    } catch {
      return null;
    }
  }
  // macOS / BSD: ps -o command= -p <pid>
  try {
    return execSync(`ps -o command= -p ${pid}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function isViteProcess(pid: number): boolean {
  // Step 1: signal-0 existence check
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // Step 2: cmdline identity check — guards against PID reuse
  const cmdline = getProcessCmdline(pid);
  if (!cmdline) return false;
  return cmdline.includes('vite');
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolveProbe) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (inUse: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolveProbe(inUse);
    };
    sock.setTimeout(500);
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
    sock.connect(port, '127.0.0.1');
  });
}

async function killViteGracefully(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const stillAlive = isViteProcess(pid);
    const portBusy = await isPortInUse(VITE_PORT);
    if (!stillAlive && !portBusy) return;
    await delay(150);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
  await delay(200);
}

async function pollViteReady(): Promise<void> {
  const deadline = Date.now() + VITE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${VITE_PORT}/`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.status === 200) return;
    } catch {
      /* not ready yet */
    }
    await delay(250);
  }
  throw new Error(
    `Vite did not become ready on port ${VITE_PORT} within ${VITE_READY_TIMEOUT_MS}ms — see ${VITE_LOG_FILE}`,
  );
}

function spawnVite(sketchPath: string): VitePidRecord {
  const logFd = openSync(VITE_LOG_FILE, 'w');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, VITE_SKETCH: sketchPath },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  if (typeof child.pid !== 'number') {
    throw new Error('Failed to spawn Vite — no PID returned by child_process.spawn');
  }
  child.unref();
  const record: VitePidRecord = { pid: child.pid, sketch: sketchPath, port: VITE_PORT };
  writeVitePid(record);
  return record;
}

async function ensureVite(sketchPath: string): Promise<VitePidRecord> {
  const existing = readVitePid();
  if (existing && isViteProcess(existing.pid)) {
    if (existing.sketch === sketchPath) return existing;
    console.error(
      `[cloud-render] rotating Vite (was: ${existing.sketch}, now: ${sketchPath})`,
    );
    await killViteGracefully(existing.pid);
    removeVitePid();
  } else if (existing) {
    removeVitePid();
  }
  const record = spawnVite(sketchPath);
  await pollViteReady();
  return record;
}

function chromiumExecutableMissing(): boolean {
  try {
    const path = chromium.executablePath();
    return !path || !existsSync(path);
  } catch {
    return true;
  }
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
  await ensureVite(sketchPath);

  if (chromiumExecutableMissing()) {
    runInstall();
    if (chromiumExecutableMissing()) {
      throw new Error(
        `chrome-headless-shell still missing after install — see ${INSTALL_LOG_FILE}`,
      );
    }
  }

  const browser = await chromium.launch({
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 1280 } });
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
  const record = readVitePid();
  if (!record) {
    process.stdout.write('[cloud-render] no Vite PID recorded — nothing to stop\n');
    return;
  }
  if (isViteProcess(record.pid)) {
    await killViteGracefully(record.pid);
  }
  removeVitePid();
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
