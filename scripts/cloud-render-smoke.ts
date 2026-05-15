#!/usr/bin/env tsx
/**
 * cloud-render-smoke — drives cloud-render against two test sketches (2D + WebGL),
 * asserts the resulting PNGs are non-blank, and records wall-clock timings against
 * the plan's acceptance-criteria budgets.
 *
 * Exits 0 only if every assertion passes AND every timing is within budget
 * (with a 20% sandbox-jitter slack). On failure, exits non-zero with a labeled
 * row indicating which check broke.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PNG } from 'pngjs';

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = join(PROJECT_ROOT, 'output');

const BUDGETS = {
  coldFirstRenderMs: 15_000,
  warmRenderMs: 7_000,
  switchRenderMs: 15_000,
};
const SLACK = 1.2;

type RenderCase = {
  label: string;
  sketch: string;
  budgetMs: number;
};

const CASES: RenderCase[] = [
  {
    label: 'cold first render (2D)',
    sketch: 'sketches/_test/cloud-render-2d',
    budgetMs: BUDGETS.coldFirstRenderMs,
  },
  {
    label: 'warm same-sketch render (2D)',
    sketch: 'sketches/_test/cloud-render-2d',
    budgetMs: BUDGETS.warmRenderMs,
  },
  {
    label: 'sketch switch + WebGL render',
    sketch: 'sketches/_test/cloud-render-webgl',
    budgetMs: BUDGETS.switchRenderMs,
  },
];

type RenderResult = {
  filename: string;
  elapsedMs: number;
};

function callCloudRender(sketchPath: string): RenderResult {
  const start = performance.now();
  const result = spawnSync('npx', ['tsx', 'scripts/cloud-render.ts', sketchPath], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  const elapsedMs = performance.now() - start;
  if (result.status !== 0) {
    throw new Error(
      `cloud-render failed for ${sketchPath}: status=${result.status}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    );
  }
  const lines = result.stdout.trim().split('\n');
  const last = lines[lines.length - 1];
  let parsed: { filename?: string };
  try {
    parsed = JSON.parse(last) as { filename?: string };
  } catch (err) {
    throw new Error(
      `cloud-render did not print JSON filename on last line:\n${result.stdout}\n(${String(err)})`,
    );
  }
  if (!parsed.filename) {
    throw new Error(`cloud-render JSON missing filename:\n${last}`);
  }
  return { filename: parsed.filename, elapsedMs };
}

function pngPath(filename: string): string {
  if (filename.startsWith('/')) return filename;
  if (filename.startsWith('output/')) return join(PROJECT_ROOT, filename);
  return join(OUTPUT_DIR, filename);
}

function assertPngHasVariance(file: string): void {
  if (!existsSync(file)) {
    throw new Error(`expected PNG at ${file} but it does not exist`);
  }
  const size = statSync(file).size;
  if (size < 1024) {
    throw new Error(`PNG at ${file} is smaller than 1KB (${size} bytes)`);
  }
  const buffer = readFileSync(file);
  const png = PNG.sync.read(buffer);
  const midY = Math.floor(png.height / 2);
  const rowStart = midY * png.width * 4;
  let min = 255;
  let max = 0;
  for (let x = 0; x < png.width; x++) {
    const r = png.data[rowStart + x * 4];
    if (r < min) min = r;
    if (r > max) max = r;
  }
  if (max - min === 0) {
    throw new Error(`PNG at ${file} has zero pixel variance across its middle row`);
  }
}

type Row = {
  label: string;
  ok: boolean;
  elapsedMs: number;
  budgetMs: number;
  note: string;
};

async function main(): Promise<void> {
  const rows: Row[] = [];
  let allPass = true;

  for (const c of CASES) {
    let row: Row;
    try {
      const r = callCloudRender(c.sketch);
      assertPngHasVariance(pngPath(r.filename));
      const budgetWithSlack = c.budgetMs * SLACK;
      const ok = r.elapsedMs <= budgetWithSlack;
      row = {
        label: c.label,
        ok,
        elapsedMs: r.elapsedMs,
        budgetMs: c.budgetMs,
        note: ok ? 'OK' : `over budget (×${SLACK} slack: ${Math.round(budgetWithSlack)}ms)`,
      };
    } catch (err) {
      row = {
        label: c.label,
        ok: false,
        elapsedMs: 0,
        budgetMs: c.budgetMs,
        note: err instanceof Error ? err.message : String(err),
      };
    }
    if (!row.ok) allPass = false;
    rows.push(row);
  }

  // Tear down Vite to leave a clean state
  spawnSync('npx', ['tsx', 'scripts/cloud-render.ts', 'stop'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });

  process.stdout.write('\n=== cloud-render smoke results ===\n');
  for (const r of rows) {
    const flag = r.ok ? 'PASS' : 'FAIL';
    process.stdout.write(
      `[${flag}] ${r.label}: ${Math.round(r.elapsedMs)}ms (budget ${r.budgetMs}ms) — ${r.note}\n`,
    );
  }
  process.stdout.write('===\n');

  process.exit(allPass ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[cloud-render-smoke] ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
