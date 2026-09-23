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
 * at any sketch by navigation alone. Restarting is for when our own server is
 * on the wrong sketch or wedged.
 *
 * The runner only ever signals a process it started: the pid on the port must
 * match the .cloud-render/vite.pid record and still look like our
 * `npm run dev` → vite group (see `planEviction`). Anything else holding the
 * port — the user's dev server, a VS Code task, an unrelated process that
 * reused a stale pid — is refused, loudly, with the remedy. Every signal that
 * is sent is logged with the pid, the sketch, the pid file and the reason.
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

export type Logger = (message: string) => void;

const stderrLog: Logger = (message) => process.stderr.write(`[vite-runner] ${message}\n`);

/** The pid file as it is named in messages — relative, so the message reads the same anywhere. */
export const VITE_PID_FILE_LABEL = '.cloud-render/vite.pid';

/** A kill the runner has decided it is entitled to make, with everything needed to say so. */
export type KillPlan = {
  kind: 'kill';
  pid: number;
  sketch: string;
  reason: string;
};

export type EvictionPlan = KillPlan | { kind: 'refuse'; message: string };

/** Process probes, injectable so the decision can be tested without real processes. */
export type ProcessProbe = {
  isVite: (pid: number) => boolean;
  cmdline: (pid: number) => string | null;
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

/** Vite binds `localhost`, which Node resolves to ::1 before 127.0.0.1, so a
 *  server can hold the port on one loopback address only. Probe both: a
 *  127.0.0.1-only probe once read a busy port as free, spawned a doomed second
 *  server, and then mistook the stranger's 200 for its own. */
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

function probeListener(port: number, host: string): Promise<boolean> {
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
    sock.connect(port, host);
  });
}

export async function isPortInUse(port: number): Promise<boolean> {
  const results = await Promise.all(LOOPBACK_HOSTS.map((host) => probeListener(port, host)));
  return results.some(Boolean);
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

const defaultProbe: ProcessProbe = { isVite: isViteProcess, cmdline: getProcessCmdline };

/**
 * Decide whether the runner may take the port back, and from whom.
 *
 * Pure: everything it needs arrives as arguments, so the rule is testable
 * without processes (scripts/vite-runner-smoke.ts). It answers `kill` only
 * when all three hold — the live server is one we recorded (`status.owned`),
 * the pid on the port is the recorded pid, and that pid still looks like our
 * `npm run dev` → vite group. Otherwise it refuses with a message that names
 * the port, the pid, its command line, the pid file and the remedy.
 *
 * This replaced a branch that freed the port by signalling whatever `lsof`
 * said held it — which once killed the user's dev server.
 */
export function planEviction(
  status: RunnerStatus,
  record: VitePidRecord | null,
  reason: string,
  probe: ProcessProbe = defaultProbe,
): EvictionPlan {
  const { pid, port } = status;
  const refuse = (message: string): EvictionPlan => ({ kind: 'refuse', message });
  if (pid === null) {
    return refuse(
      `port ${port} is held by a process the runner cannot identify (no listener pid — lsof missing?). ` +
        `The runner only stops servers it started; stop this one yourself and retry.`,
    );
  }
  const cmdline = probe.cmdline(pid) ?? 'command line unavailable';
  if (!status.owned || record === null || record.pid !== pid) {
    const recorded = record ? `records pid ${record.pid}` : 'does not exist';
    return refuse(
      `refusing to kill pid ${pid} on port ${port} (${cmdline}): the runner did not start it — ` +
        `${VITE_PID_FILE_LABEL} ${recorded}. Stop it yourself (if it is your \`npm run dev\`, ` +
        `leave it and free ${port} another way), or delete ${VITE_PID_FILE_LABEL} if it is stale.`,
    );
  }
  if (!probe.isVite(pid)) {
    return refuse(
      `refusing to kill pid ${pid} on port ${port} (${cmdline}): ${VITE_PID_FILE_LABEL} records it, ` +
        `but it is no longer an \`npm run dev\` / vite process — the pid was probably reused by ` +
        `something else. Delete ${VITE_PID_FILE_LABEL} and retry.`,
    );
  }
  return { kind: 'kill', pid, sketch: record.sketch, reason };
}

/** Terminate a server we started, saying exactly what is being signalled and why before each signal. */
export async function killViteGracefully(plan: KillPlan, log: Logger = stderrLog): Promise<void> {
  const { pid, sketch, reason } = plan;
  const who = `process group ${pid} (npm run dev → vite, sketch ${sketch}, recorded in ${VITE_PID_FILE_LABEL})`;
  log(`SIGTERM → ${who} — reason: ${reason}`);
  if (!killGroup(pid, 'SIGTERM')) {
    log(`process group ${pid} was already gone`);
    return;
  }
  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const stillAlive = isViteProcess(pid);
    const portBusy = await isPortInUse(VITE_PORT);
    if (!stillAlive && !portBusy) return;
    await delay(150);
  }
  log(`still holding port ${VITE_PORT} ${PORT_FREE_TIMEOUT_MS}ms after SIGTERM — SIGKILL → ${who}`);
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

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tailLog(lines = 8): string {
  try {
    return readFileSync(VITE_LOG_FILE, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

/**
 * Wait until the server answers on VITE_PORT. When `record` is given, the
 * process it names must stay alive throughout: a 200 alone is not proof of
 * readiness, because a *different* server on the port (e.g. another
 * checkout's runner) answers just the same while ours has already died with
 * "Port … is already in use". That failure is reported with the log tail.
 */
export async function pollViteReady(record?: VitePidRecord): Promise<void> {
  const deadline = Date.now() + VITE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (record && !isAlive(record.pid)) {
      throw new Error(
        `our Vite (pid ${record.pid}, sketch ${record.sketch}) exited before it became ready — ` +
          `${VITE_LOG_FILE} ends with:\n${tailLog()}`,
      );
    }
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
 * A live server of ours is replaced rather than shared when it can't give the
 * caller what it asked for — with `--strictPort` Vite refuses the port instead
 * of falling through to the next one, so our old server has to go first.
 * `anySketch` opts out of that, for callers who steer by URL instead. A server
 * we did not start is never replaced: `planEviction` refuses and this throws.
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
    const reason = opts.force
      ? `restart requested (was serving ${current.sketch ?? 'an unrecorded sketch'})`
      : `rotating from ${current.sketch ?? 'an unrecorded sketch'} to ${sketchPath}`;
    const plan = planEviction(current, readVitePid(), reason);
    if (plan.kind === 'refuse') throw new Error(plan.message);
    await killViteGracefully(plan, log);
    removeVitePid();
    replaced = true;
  } else if (readVitePid()) {
    removeVitePid(); // stale record for a process that has since exited
  }

  const record = spawnVite(sketchPath);
  try {
    await pollViteReady(record);
  } catch (err) {
    removeVitePid(); // the record describes a server that never came up
    throw err;
  }
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
export async function stopVite(opts: { log?: Logger } = {}): Promise<VitePidRecord | null> {
  const log = opts.log ?? stderrLog;
  const record = readVitePid();
  if (!record) return null;
  if (isViteProcess(record.pid)) {
    await killViteGracefully(
      { kind: 'kill', pid: record.pid, sketch: record.sketch, reason: 'stop requested' },
      log,
    );
  } else {
    log(
      `pid ${record.pid} in ${VITE_PID_FILE_LABEL} is no longer an npm run dev / vite process — removing the stale record, nothing signalled`,
    );
  }
  removeVitePid();
  return record;
}
