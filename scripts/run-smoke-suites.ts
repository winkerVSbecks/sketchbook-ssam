/**
 * `npm run test` — runs every Node smoke suite in this directory, one after
 * another, and prints a per-suite summary. Exits non-zero if any suite does.
 *
 * Suites are discovered, not listed: any `scripts/*smoke*.ts` is one, so a new
 * suite is picked up without editing this file. The single exception is
 * cloud-render-smoke.ts, which needs Playwright + Chromium and spawns the
 * detached Vite on :6173 — it stays behind `npm run cloud:smoke`.
 *
 * Each suite is expected to exit non-zero on its first failed assertion and to
 * end its output with `N tests passed` / `N passed`; the count is read from
 * that line for the summary.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(here, '..');
const SELF = basename(fileURLToPath(import.meta.url));

/** Needs a browser and a dev server; run it deliberately with `npm run cloud:smoke`. */
const BROWSER_SUITES = new Set(['cloud-render-smoke.ts']);

type SuiteResult = {
  file: string;
  passed: number | null;
  ok: boolean;
  ms: number;
  exit: string;
};

function discoverSuites(): string[] {
  return readdirSync(here)
    .filter((f) => /smoke.*\.ts$/.test(f) && f !== SELF && !BROWSER_SUITES.has(f))
    .sort();
}

function tsxBin(): string {
  const local = join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx');
  return existsSync(local) ? local : 'tsx';
}

function runSuite(file: string): SuiteResult {
  const started = performance.now();
  const result = spawnSync(tsxBin(), [join(here, file)], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ms = performance.now() - started;
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  const counts = [...(result.stdout ?? '').matchAll(/^(\d+)(?: tests)? passed\s*$/gm)];
  const last = counts.at(-1);
  const passed = last ? Number.parseInt(last[1], 10) : null;
  const ok = result.status === 0 && result.error === undefined;
  const exit =
    result.error !== undefined
      ? `spawn error: ${result.error.message}`
      : result.signal !== null
        ? `signal ${result.signal}`
        : `exit ${result.status}`;
  return { file, passed, ok, ms, exit };
}

function main(): void {
  const suites = discoverSuites();
  if (suites.length === 0) {
    process.stderr.write(`no smoke suites found in ${here}\n`);
    process.exit(1);
  }

  const results: SuiteResult[] = [];
  for (const file of suites) {
    process.stdout.write(`\n▶ ${file}\n`);
    results.push(runSuite(file));
  }

  const width = Math.max(...results.map((r) => r.file.length), 'suite'.length);
  process.stdout.write(`\n${'suite'.padEnd(width)}  tests  time     result\n`);
  for (const r of results) {
    const tests = r.passed === null ? '?' : String(r.passed);
    const time = `${(r.ms / 1000).toFixed(1)}s`;
    const verdict = r.ok ? 'pass' : `FAIL (${r.exit})`;
    process.stdout.write(`${r.file.padEnd(width)}  ${tests.padStart(5)}  ${time.padEnd(7)}  ${verdict}\n`);
  }

  const failed = results.filter((r) => !r.ok);
  const total = results.reduce((sum, r) => sum + (r.passed ?? 0), 0);
  process.stdout.write(
    `\n${results.length} suites, ${total} tests, ${failed.length} failed` +
      (failed.length ? `: ${failed.map((r) => r.file).join(', ')}` : '') +
      '\n',
  );
  process.exit(failed.length ? 1 : 0);
}

main();
