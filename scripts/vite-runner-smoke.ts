/**
 * Node smoke test for the eviction rule in `scripts/vite-runner.ts`.
 * Run: `npx tsx scripts/vite-runner-smoke.ts` — exits non-zero on the first failure.
 *
 * `planEviction` is the only place the runner decides to signal a process, so
 * this pins the invariant that once cost a debugging session: it may only kill
 * a server it started itself, and it must say what and why.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as net from 'node:net';
import {
  isPortInUse,
  planEviction,
  pollViteReady,
  VITE_PID_FILE_LABEL,
  VITE_PORT,
  type ProcessProbe,
  type RunnerStatus,
  type VitePidRecord,
} from './vite-runner';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Listen on one loopback address only, on an OS-chosen port; null if the family is unavailable. */
function listenOn(host: string): Promise<{ port: number; close: () => Promise<void> } | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(null));
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ port, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

const record: VitePidRecord = {
  pid: 4242,
  sketch: 'sketches/_test/cloud-render-2d',
  port: VITE_PORT,
};
const ours: RunnerStatus = {
  port: VITE_PORT,
  running: true,
  sketch: record.sketch,
  pid: record.pid,
  owned: true,
};
const foreign: RunnerStatus = {
  port: VITE_PORT,
  running: true,
  sketch: null,
  pid: 9001,
  owned: false,
};

/** A probe that would say yes to anything — the decision must not lean on it for ownership. */
const gullible: ProcessProbe = { isVite: () => true, cmdline: () => 'node fake-dev-server.js' };
const viteProbe: ProcessProbe = { isVite: () => true, cmdline: () => 'npm run dev -- --port 6173' };

await test('kills only the owned, recorded, still-vite process — and carries pid, sketch and reason', () => {
  const plan = planEviction(ours, record, 'restart requested', viteProbe);
  assert.equal(plan.kind, 'kill');
  if (plan.kind !== 'kill') return;
  assert.equal(plan.pid, 4242);
  assert.equal(plan.sketch, record.sketch);
  assert.equal(plan.reason, 'restart requested');
});

await test('refuses an unrecorded process on the port even when it looks like vite', () => {
  const plan = planEviction(foreign, null, 'rotating', gullible);
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.message, /refusing to kill pid 9001/);
  assert.match(plan.message, new RegExp(`port ${VITE_PORT}`));
  assert.match(plan.message, /node fake-dev-server\.js/, 'names the command line');
  assert.match(
    plan.message,
    new RegExp(VITE_PID_FILE_LABEL.replace('.', '\\.')),
    'names the pid file',
  );
  assert.match(plan.message, /does not exist/);
  assert.match(plan.message, /did not start it/);
});

await test('refuses when a record exists but the pid on the port is a different process', () => {
  const plan = planEviction(foreign, record, 'rotating', gullible);
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.message, /refusing to kill pid 9001/);
  assert.match(plan.message, /records pid 4242/, 'says what the pid file actually records');
});

await test('refuses when the status claims ownership but the pid does not match the record', () => {
  const plan = planEviction({ ...ours, pid: 5555 }, record, 'rotating', viteProbe);
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.message, /refusing to kill pid 5555/);
});

await test('refuses a recorded pid that is no longer a vite process (pid reuse)', () => {
  const reused: ProcessProbe = { isVite: () => false, cmdline: () => 'postgres: checkpointer' };
  const plan = planEviction(ours, record, 'rotating', reused);
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.message, /refusing to kill pid 4242/);
  assert.match(plan.message, /postgres: checkpointer/);
  assert.match(plan.message, /reused/);
  assert.match(plan.message, new RegExp(`Delete ${VITE_PID_FILE_LABEL.replace('.', '\\.')}`));
});

await test('refuses when the listener cannot be identified at all', () => {
  const plan = planEviction({ ...foreign, pid: null }, null, 'rotating', gullible);
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.message, /cannot identify/);
  assert.match(plan.message, /only stops servers it started/);
});

await test('never consults the probe to decide ownership', () => {
  let asked = 0;
  const counting: ProcessProbe = {
    isVite: () => {
      asked += 1;
      return true;
    },
    cmdline: () => null,
  };
  const plan = planEviction(foreign, null, 'rotating', counting);
  assert.equal(plan.kind, 'refuse');
  assert.equal(asked, 0, 'isVite is only a final check for owned pids');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.message, /command line unavailable/, 'a null cmdline is still reported');
});

await test('isPortInUse sees a listener bound to ::1 only (the case that fooled the runner)', async () => {
  const server = await listenOn('::1');
  if (!server) {
    console.log('    (IPv6 loopback unavailable here — skipped)');
    return;
  }
  try {
    assert.equal(await isPortInUse(server.port), true);
  } finally {
    await server.close();
  }
});

await test('isPortInUse sees a listener bound to 127.0.0.1 only, and a closed port as free', async () => {
  const server = await listenOn('127.0.0.1');
  assert.ok(server, 'IPv4 loopback must be available');
  const { port } = server;
  try {
    assert.equal(await isPortInUse(port), true);
  } finally {
    await server.close();
  }
  assert.equal(await isPortInUse(port), false, 'free once the listener is gone');
});

await test('pollViteReady fails at once, naming pid, sketch and the log, when our process has exited', async () => {
  // A process that has certainly exited: run one to completion and reuse its pid.
  const gone = spawnSync(process.execPath, ['-e', '0']);
  const pid = gone.pid;
  assert.ok(pid && pid > 0);
  const record: VitePidRecord = { pid, sketch: 'sketches/_test/cloud-render-2d', port: VITE_PORT };
  const started = Date.now();
  await assert.rejects(pollViteReady(record), (err: Error) => {
    assert.match(err.message, new RegExp(`pid ${pid}`));
    assert.match(err.message, /sketches\/_test\/cloud-render-2d/);
    assert.match(err.message, /exited before it became ready/);
    assert.match(err.message, /vite\.log ends with/);
    return true;
  });
  assert.ok(Date.now() - started < 2_000, 'does not wait out the readiness timeout');
});

console.log(`\n${passed} tests passed`);
