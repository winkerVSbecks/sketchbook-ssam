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
  type Commit,
  type History,
} from './output-sketches/history.ts';
import { shortlist, WINDOW_AFTER_MS, WINDOW_BEFORE_MS } from './output-sketches/shortlist.ts';

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

const DAY = 86_400_000;
const EXPORT_TS = new Date(2025, 5, 10, 12, 0, 0).getTime();
const exportName = '2025.06.10-12.00.00';

function fakeHistory(over: Partial<History> & { commits: Commit[] }): History {
  return {
    current: (p) => p,
    existsAtHead: () => true,
    entryFilesAt: (sha) =>
      new Set(over.commits.find((c) => c.sha === sha)?.changes.map((c) => c.path) ?? []),
    importersAt: () => [],
    prefixFamilies: new Map(),
    ...over,
  };
}

const commitAt = (sha: string, time: number, ...paths: string[]): Commit => ({
  sha,
  time,
  changes: paths.map((path) => ({ status: 'M' as const, path })),
});

const P = (n: string) => `src/sketches/${n}.ts`;
const idsOf = (s: { candidates: { id: string }[] }) => s.candidates.map((c) => c.id);

test('window includes 2 days before and 3 after', () => {
  assert.equal(WINDOW_BEFORE_MS, 2 * DAY);
  assert.equal(WINDOW_AFTER_MS, 3 * DAY);
  const h = fakeHistory({
    commits: [
      commitAt('c1', EXPORT_TS - 2 * DAY - 1000, P('early')),
      commitAt('c2', EXPORT_TS - 2 * DAY, P('before')),
      commitAt('c3', EXPORT_TS + 3 * DAY, P('after')),
      commitAt('c4', EXPORT_TS + 3 * DAY + 1000, P('late')),
    ],
  });
  const s = shortlist(parseName(`${exportName}.png`), h);
  assert.equal(s.source, 'window');
  assert.deepEqual(idsOf(s), ['sketches/after', 'sketches/before']);
});

test('helper-only commit maps to importers', () => {
  const h = fakeHistory({
    commits: [commitAt('c1', EXPORT_TS, P('lib/helper'))],
    entryFilesAt: () => new Set([P('a'), P('b')]),
    importersAt: (_sha, helper) => (helper === P('lib/helper') ? [P('a'), P('b')] : []),
  });
  const s = shortlist(parseName(`${exportName}.png`), h);
  assert.deepEqual(idsOf(s), ['sketches/a', 'sketches/b']);
});

const familyHistory = (family: string[]) =>
  fakeHistory({
    commits: [commitAt('c1', EXPORT_TS, P('a'), P('c'))],
    prefixFamilies: new Map([['arcs', new Set(family.map(P))]]),
  });

test('prefix family narrows the window', () => {
  const s = shortlist(parseName(`arcs-${exportName}.png`), familyHistory(['a', 'b']));
  assert.equal(s.source, 'prefix+window');
  assert.deepEqual(idsOf(s), ['sketches/a']);
});

test('prefix family used alone when window misses it', () => {
  const s = shortlist(parseName(`arcs-${exportName}.png`), familyHistory(['x', 'y']));
  assert.equal(s.source, 'prefix');
  assert.deepEqual(idsOf(s), ['sketches/x', 'sketches/y']);
});

test('unknown hash falls back to window; known hash narrows', () => {
  const h = fakeHistory({
    commits: [
      commitAt('abcdef0123', EXPORT_TS, P('a'), P('b')),
      commitAt('ffff', EXPORT_TS, P('c')),
    ],
  });
  const unknown = shortlist(parseName(`${exportName}-1234567.png`), h);
  assert.equal(unknown.source, 'window');
  assert.deepEqual(idsOf(unknown), ['sketches/a', 'sketches/b', 'sketches/c']);
  const known = shortlist(parseName(`${exportName}-abcdef0.png`), h);
  assert.equal(known.source, 'hash+window');
  assert.deepEqual(idsOf(known), ['sketches/a', 'sketches/b']);
});

test('withhold ignores prefix', () => {
  const s = shortlist(parseName(`arcs-${exportName}.png`), familyHistory(['a']), {
    withhold: true,
  });
  assert.equal(s.source, 'window');
  assert.deepEqual(idsOf(s), ['sketches/a', 'sketches/c']);
});

test('undated stray has no candidates', () => {
  const s = shortlist(parseName('w9-verify-torsions-palette0.png'), familyHistory(['z']));
  assert.deepEqual(s, { candidates: [], source: 'none' });
});

test('renamed candidate reports both paths', () => {
  const h = fakeHistory({
    commits: [commitAt('c1', EXPORT_TS, P('old'))],
    current: (p) => (p === P('old') ? P('new') : p),
    existsAtHead: (p) => p !== P('old'),
  });
  const [c] = shortlist(parseName(`${exportName}.png`), h).candidates;
  assert.deepEqual(c, {
    id: 'sketches/new',
    path: P('new'),
    pathAtExport: P('old'),
    deleted: false,
  });
});

console.log(`${passed} tests passed`);
