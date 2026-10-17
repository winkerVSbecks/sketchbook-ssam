/**
 * Node smoke test for output → sketch attribution (shared types, accept rule, store).
 * Run: `npx tsx scripts/output-sketches-smoke.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';
import {
  applyAccept,
  mergeFiles,
  emptyAttributionFile,
  thresholdFor,
  type FileAttribution,
  type JevAnswer,
} from '../archive-app/src/review/attribution.ts';
import { parseName } from '../archive-app/src/review/model.ts';
import {
  forwardRenames,
  parseGitLog,
  resolveImport,
  sketchIdOf,
} from './output-sketches/history.ts';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const paths = {
  'sketches/a': {
    path: 'src/sketches/a.ts',
    pathAtExport: 'src/sketches/old-a.ts',
    deleted: false,
  },
};

function entry(
  answer: JevAnswer | undefined,
  over: Partial<FileAttribution> = {},
): FileAttribution {
  return {
    sketch: null,
    path: null,
    pathAtExport: null,
    method: 'unlabelled',
    confidence: null,
    candidates: ['sketches/a'],
    answer,
    taggedAt: '2026-10-17T00:00:00.000Z',
    ...over,
  };
}

function answer(choice: string | null, confidence: number): JevAnswer {
  return { choice, confidence, probabilities: { 'sketches/a': confidence, none: 1 - confidence } };
}

test('thresholdFor uses the year override', () => {
  const t = { default: 0.7, byYear: { '2024': 0.85 } };
  assert.equal(thresholdFor(t, new Date(2024, 2, 1).getTime()), 0.85);
  assert.equal(thresholdFor(t, new Date(2025, 2, 1).getTime()), 0.7);
  assert.equal(thresholdFor(t, null), 0.7);
});

test('applyAccept labels at or above threshold', () => {
  const out = applyAccept(entry(answer('sketches/a', 0.7)), Date.now(), { default: 0.7 }, paths);
  assert.equal(out.method, 'jev');
  assert.equal(out.sketch, 'sketches/a');
  assert.equal(out.path, 'src/sketches/a.ts');
  assert.equal(out.pathAtExport, 'src/sketches/old-a.ts');
  assert.equal(out.reason, undefined);
});

test('applyAccept leaves low confidence unlabelled', () => {
  const out = applyAccept(entry(answer('sketches/a', 0.69)), Date.now(), { default: 0.7 }, paths);
  assert.equal(out.sketch, null);
  assert.equal(out.method, 'unlabelled');
  assert.equal(out.reason, 'low-confidence');
  assert.equal(out.confidence, 0.69);
});

test('applyAccept treats none as unlabelled', () => {
  const out = applyAccept(entry(answer(null, 1)), Date.now(), { default: 0.7 }, paths);
  assert.equal(out.sketch, null);
  assert.equal(out.method, 'unlabelled');
  assert.equal(out.reason, 'none');
  assert.equal(out.confidence, 1);
});

test('applyAccept keeps prefix entries', () => {
  const prefix = entry(undefined, { method: 'prefix', sketch: 'sketches/a', confidence: null });
  assert.deepEqual(applyAccept(prefix, Date.now(), { default: 0.7 }, paths), prefix);
});

test('mergeFiles overwrites by name and keeps the rest', () => {
  const base = mergeFiles(emptyAttributionFile('jev-1.14.0'), { 'a.png': entry(undefined) });
  const next = mergeFiles(base, {
    'a.png': entry(undefined, { reason: 'error' }),
    'b.png': entry(undefined),
  });
  assert.equal(next.files['a.png']?.reason, 'error');
  assert.ok(next.files['b.png']);
  assert.equal(Object.keys(base.files).length, 1);
});

test('parseName reads prefix, hash and stamp', () => {
  const a = parseName('arcs-reduction-2025.10.05-19.59.49-b46dc92.png');
  assert.equal(a.prefix, 'arcs-reduction');
  assert.equal(a.hash, 'b46dc92');
  assert.notEqual(parseName('CleanShot 2022-04-15 at 17.31.04.mp4').ts, null);
  assert.equal(parseName('w9-verify-torsions-palette0.png').ts, null);
});

const LOG = [
  '@aaa111 1700000000',
  'A\tsrc/sketches/x/one.ts',
  'M\tsrc/sketches/x/two.ts',
  '',
  '@bbb222 1700003600',
  'R087\tsrc/sketches/differential-growth/windows.ts\tsrc/sketches/differential-growth/jali.ts',
  'D\tsrc/sketches/x/gone.ts',
  '',
].join('\n');

test('parseGitLog reads adds, edits and renames', () => {
  const commits = parseGitLog(LOG);
  assert.equal(commits.length, 2);
  assert.equal(commits[0]?.sha, 'aaa111');
  assert.equal(commits[0]?.time, 1700000000 * 1000);
  assert.deepEqual(commits[0]?.changes, [
    { status: 'A', path: 'src/sketches/x/one.ts' },
    { status: 'M', path: 'src/sketches/x/two.ts' },
  ]);
  assert.equal(commits[1]?.sha, 'bbb222');
  assert.deepEqual(commits[1]?.changes[0], {
    status: 'R',
    from: 'src/sketches/differential-growth/windows.ts',
    path: 'src/sketches/differential-growth/jali.ts',
  });
  assert.deepEqual(commits[1]?.changes[1], { status: 'D', path: 'src/sketches/x/gone.ts' });
});

test('forwardRenames follows chains', () => {
  const mk = (sha: string, time: number, from: string, path: string) => ({
    sha,
    time,
    changes: [{ status: 'R' as const, from, path }],
  });
  const cur = forwardRenames([mk('1', 1, 'A', 'B'), mk('2', 2, 'B', 'C')]);
  assert.equal(cur('A'), 'C');
  assert.equal(cur('B'), 'C');
  assert.equal(cur('Z'), 'Z');
  const back = forwardRenames([mk('1', 1, 'A', 'B'), mk('2', 2, 'B', 'A')]);
  assert.equal(back('A'), 'A');
  assert.equal(back('B'), 'A');
});

test('sketchIdOf strips src and .ts', () => {
  assert.equal(sketchIdOf('src/sketches/x/y.ts'), 'sketches/x/y');
});

test('resolveImport handles ./, ../ and bare', () => {
  assert.equal(
    resolveImport('src/sketches/nalee/a.ts', './walker'),
    'src/sketches/nalee/walker.ts',
  );
  assert.equal(resolveImport('src/sketches/nalee/a.ts', '../lib/x.ts'), 'src/sketches/lib/x.ts');
  assert.equal(resolveImport('src/sketches/nalee/a.ts', 'd3'), null);
});

console.log(`${passed} tests passed`);
