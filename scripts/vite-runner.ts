/**
 * Shared lifecycle for the runner's sketch dev server on :6173 — its own
 * port, so it never evicts or gets mistaken for a hand-started `npm run dev`
 * on Vite's default :5173.
 *
 * Two callers want the same thing — a Vite dev server up on a known port,
 * running a known sketch, rotatable on demand:
 *
 *   scripts/cloud-render.ts            headless renders in the web sandbox
 *   archive-app/src/runner/plugin.ts   the archive site's play button
 *
 * They share one PID record (.cloud-render/vite.pid) so they cooperate over
 * the port instead of racing for it.
 *
 * Note that `VITE_SKETCH` only sets the *default* sketch: src/index.ts reads
 * `?sketch=` off the URL first, so a server that is already up can be pointed
 * at any sketch by navigation alone. Restarting is for when the port is held
 * by something we can't steer, or when the process is wedged.
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import * as net from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));

/** Resolved from this file, not cwd — npm workspaces run scripts from the
 *  workspace directory, and the archive plugin lives in one. */
export const PROJECT_ROOT = resolve(here, '..');
export const RUNNER_DIR = join(PROJECT_ROOT, '.cloud-render');
export const VITE_PID_FILE = join(RUNNER_DIR, 'vite.pid');
export const VITE_LOG_FILE = join(RUNNER_DIR, 'vite.log');

/** The runner's port. Deliberately not Vite's default (5173): that one is the user's. */
export const VITE_PORT = 6173;
export const VITE_READY_TIMEOUT_MS = 30_000;
export const PORT_FREE_TIMEOUT_MS = 5_000;

export type VitePidRecord = {
  pid: number;
  sketch: string;
  port: number;
};

export type RunnerStatus = {
  port: number;
  running: boolean;
  /** the sketch VITE_SKETCH was bound to — only known for servers we started */
  sketch: string | null;
  pid: number | null;
  /** true when the live server is one we recorded, and can therefore rotate */
  owned: boolean;
};

export type EnsureOptions = {
  log?: (message: string) => void;
  /** Reuse whatever server is already up, whichever sketch it was started
   *  with — correct when the caller selects its sketch by navigating to
   *  `?sketch=` rather than relying on VITE_SKETCH. Without it, a server on the
   *  wrong sketch (or one we have no record of) is replaced. */
  anySketch?: boolean;
  /** Restart even when the live server would otherwise have been reused. */
  force?: boolean;
};

export type EnsureResult = RunnerStatus & {
  status: 'reused' | 'adopted' | 'rotated' | 'spawned';
};

/** The dev server's URL for a given sketch id, e.g. "sketches/nalee/loom-3". */
export const sketchUrl = (id: string, port: number = VITE_PORT): string =>
  `http://localhost:${port}/?sketch=${encodeURIComponent(id)}`;

export function ensureRunnerDir(): void {
  mkdirSync(RUNNER_DIR, { recursive: true });
}

export function readVitePid(): VitePidRecord | null {
  if (!existsSync(VITE_PID_FILE)) return null;
  try {
    return JSON.parse(readFileSync(VITE_PID_FILE, 'utf8')) as VitePidRecord;
  } catch {
    return null;
  }
}

export function writeVitePid(record: VitePidRecord): void {
  writeFileSync(VITE_PID_FILE, JSON.stringify(record, null, 2));
}

export function removeVitePid(): void {
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

export function isViteProcess(pid: number): boolean {
  // Step 1: signal-0 existence check
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // Step 2: cmdline identity check — guards against PID reuse.
  // We spawn `npm run dev`, so the recorded PID is the npm wrapper, not the
  // vite child it execs. Accept either: direct vite, or `npm … dev` / `npm-cli.js … dev`.
  const cmdline = getProcessCmdline(pid);
  if (!cmdline) return false;
  return /\bvite\b/.test(cmdline) || /\bnpm(-cli\.js)?\b.*\bdev\b/.test(cmdline);
}

export function isPortInUse(port: number): Promise<boolean> {
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

/** PID of whatever is listening on the port, when we have no record of it —
 *  e.g. a server started by the VS Code "Run Sketch" task. Null when lsof is
 *  unavailable (some containers) or the port is free. */
export function findPortOwner(port: number): number | null {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const first = out.split('\n')[0] ?? '';
    const pid = Number.parseInt(first, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// Spawned with `detached: true`, so npm wrapper + vite child share a process
// group. Signal the whole group via -pid; signalling only the npm wrapper
// leaves the vite child orphaned and still bound to the port, which would
// cause the next `spawnVite` to silently fail and the old sketch to keep
// being served.
export function killGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

export async function killViteGracefully(pid: number): Promise<void> {
  if (!killGroup(pid, 'SIGTERM')) return;
  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const stillAlive = isViteProcess(pid);
    const portBusy = await isPortInUse(VITE_PORT);
    if (!stillAlive && !portBusy) return;
    await delay(150);
  }
  killGroup(pid, 'SIGKILL');
  const killDeadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < killDeadline) {
    if (!(await isPortInUse(VITE_PORT))) return;
    await delay(150);
  }
  throw new Error(
    `Vite still holds port ${VITE_PORT} after SIGKILL of pgid ${pid} — manual cleanup required`,
  );
}

export async function pollViteReady(): Promise<void> {
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

export function spawnVite(sketchPath: string): VitePidRecord {
  ensureRunnerDir();
  const logFd = openSync(VITE_LOG_FILE, 'w');
  // `--strictPort`: bind exactly VITE_PORT or fail loudly (see the log),
  // never drift to a neighbouring port behind the pid record's back.
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(VITE_PORT), '--strictPort'], {
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

/** What, if anything, is serving sketches right now. */
export async function runnerStatus(): Promise<RunnerStatus> {
  const record = readVitePid();
  if (record && isViteProcess(record.pid)) {
    return {
      port: record.port ?? VITE_PORT,
      running: true,
      sketch: record.sketch,
      pid: record.pid,
      owned: true,
    };
  }
  if (await isPortInUse(VITE_PORT)) {
    return {
      port: VITE_PORT,
      running: true,
      sketch: null,
      pid: findPortOwner(VITE_PORT),
      owned: false,
    };
  }
  return { port: VITE_PORT, running: false, sketch: null, pid: null, owned: false };
}

/**
 * Get a dev server up on VITE_PORT serving `sketchPath`.
 *
 * A live server is replaced rather than shared when it can't give the caller
 * what it asked for — with `--strictPort` Vite refuses the port instead of
 * falling through to the next one, so anything already on VITE_PORT has to
 * go first. `anySketch` opts out of that, for callers who steer by URL
 * instead.
 */
export async function ensureVite(
  sketchPath: string,
  opts: EnsureOptions = {},
): Promise<EnsureResult> {
  const log = opts.log ?? (() => {});
  ensureRunnerDir();
  const current = await runnerStatus();

  let replaced = false;
  if (current.running) {
    const isRequestedSketch = current.owned && current.sketch === sketchPath;
    if (!opts.force && (isRequestedSketch || opts.anySketch)) {
      return { ...current, status: isRequestedSketch ? 'reused' : 'adopted' };
    }
    if (current.pid === null) {
      throw new Error(
        `port ${VITE_PORT} is held by a process we can't identify — stop it and retry`,
      );
    }
    log(
      current.owned
        ? `stopping Vite (was: ${current.sketch ?? 'unknown sketch'})`
        : `taking port ${VITE_PORT} from an unrecorded process (pid ${current.pid})`,
    );
    await killViteGracefully(current.pid);
    removeVitePid();
    replaced = true;
  } else if (readVitePid()) {
    removeVitePid(); // stale record for a process that has since exited
  }

  const record = spawnVite(sketchPath);
  await pollViteReady();
  return {
    port: record.port,
    running: true,
    sketch: record.sketch,
    pid: record.pid,
    owned: true,
    status: replaced ? 'rotated' : 'spawned',
  };
}

/** Stop the server we recorded. Returns the record it killed, or null when
 *  there was nothing of ours to stop. */
export async function stopVite(): Promise<VitePidRecord | null> {
  const record = readVitePid();
  if (!record) return null;
  if (isViteProcess(record.pid)) {
    await killViteGracefully(record.pid);
  }
  removeVitePid();
  return record;
}
