/**
 * Node smoke test for output → sketch attribution (shared types, accept rule, store).
 * Run: `npx tsx scripts/output-sketches-smoke.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  type SystemOneRequest,
} from '@typesafe-ai/sdk';
import sharp from 'sharp';
import {
  applyAccept,
  seriesOf,
  seriesProbabilities,
  mergeFiles,
  emptyAttributionFile,
  thresholdFor,
  type FileAttribution,
  type JevAnswer,
} from '../archive-app/src/review/attribution.ts';
import {
  buildLedger,
  buildSketchTimeline,
  parseName,
  seriesKeyOf,
  UNLABELLED,
} from '../archive-app/src/review/model.ts';
import {
  forwardRenames,
  loadHistory,
  parseGitLog,
  resolveImport,
  sketchIdOf,
  type Commit,
  type History,
} from './output-sketches/history.ts';
import {
  loadReference,
  outputImageSource,
  prepareImage,
  referenceUrl,
} from './output-sketches/images.ts';
import { askSketch, BATCH_SIZE, type AskFn } from './output-sketches/jev.ts';
import {
  buildPilotSheet,
  formatCost,
  formatReport,
  projectCost,
  samplePilot,
  scorePilot,
  type PilotItem,
} from './output-sketches/pilot.ts';
import {
  needsTagging,
  readAttributions,
  rethreshold,
  tagFiles,
  writeAttributions,
  type RunDeps,
} from './output-sketches/run.ts';
import { shortlist, WINDOW_AFTER_MS, WINDOW_BEFORE_MS } from './output-sketches/shortlist.ts';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function atest(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
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
    series: null,
    method: 'unlabelled',
    confidence: null,
    candidates: ['sketches/a'],
    answer,
    taggedAt: '2026-10-17T00:00:00.000Z',
    ...over,
  };
}

function answer(choice: string | null, confidence: number): JevAnswer {
  const probabilities =
    choice === null
      ? { none: confidence, 'sketches/a': 1 - confidence }
      : { [choice]: confidence, none: 1 - confidence };
  return { choice, confidence, probabilities };
}

const siblings: JevAnswer = {
  choice: 'sketches/g/a',
  confidence: 0.4,
  probabilities: { 'sketches/g/a': 0.4, 'sketches/g/b': 0.35, 'sketches/x': 0.15, none: 0.1 },
};
const seriesPaths = {
  'sketches/g/a': { path: 'src/sketches/g/a.ts', pathAtExport: null, deleted: false },
  'sketches/g/b': { path: 'src/sketches/g/b.ts', pathAtExport: null, deleted: false },
  'sketches/x': { path: 'src/sketches/x.ts', pathAtExport: null, deleted: false },
};

test('seriesOf maps nested and one-off ids', () => {
  assert.equal(seriesOf('sketches/nalee/sketches/bipolar'), 'sketches/nalee');
  assert.equal(seriesOf('sketches/gravura/basic'), 'sketches/gravura');
  assert.equal(seriesOf('sketches/42-loc'), 'sketches/42-loc');
});

test('seriesProbabilities sums siblings', () => {
  const sums = seriesProbabilities(siblings);
  assert.deepEqual(Object.keys(sums).sort(), ['none', 'sketches/g', 'sketches/x']);
  assert.ok(Math.abs((sums['sketches/g'] ?? 0) - 0.75) < 1e-9);
  assert.equal(sums['sketches/x'], 0.15);
  assert.equal(sums.none, 0.1);
});

test('applyAccept labels the series and hints the top file', () => {
  const out = applyAccept(entry(siblings), Date.now(), { default: 0.7 }, seriesPaths);
  assert.equal(out.method, 'jev');
  assert.equal(out.series, 'sketches/g');
  assert.equal(out.sketch, 'sketches/g/a');
  assert.equal(out.path, 'src/sketches/g/a.ts');
  assert.ok(Math.abs((out.confidence ?? 0) - 0.75) < 1e-9);
  assert.equal(siblings.confidence, 0.4);
  assert.equal(out.answer?.confidence, 0.4);
  const low = applyAccept(entry(siblings), Date.now(), { default: 0.8 }, seriesPaths);
  assert.equal(low.method, 'unlabelled');
  assert.equal(low.reason, 'low-confidence');
  assert.equal(low.series, null);
  assert.equal(low.sketch, null);
  assert.ok(Math.abs((low.confidence ?? 0) - 0.75) < 1e-9);
});

test('applyAccept none bucket wins and is unlabelled none', () => {
  const none: JevAnswer = {
    choice: null,
    confidence: 0.6,
    probabilities: { 'sketches/g/a': 0.2, 'sketches/g/b': 0.2, none: 0.6 },
  };
  const out = applyAccept(entry(none), Date.now(), { default: 0.5 }, seriesPaths);
  assert.equal(out.method, 'unlabelled');
  assert.equal(out.reason, 'none');
  assert.equal(out.series, null);
  assert.equal(out.confidence, 0.6);
});

test('prefix entry gains series', () => {
  const prefix = entry(undefined, { method: 'prefix', sketch: 'sketches/g/a', confidence: null });
  const out = applyAccept(prefix, Date.now(), { default: 0.7 }, seriesPaths);
  assert.equal(out.series, 'sketches/g');
  assert.equal(out.sketch, 'sketches/g/a');
});

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
  const prefix = entry(undefined, {
    method: 'prefix',
    sketch: 'sketches/a',
    series: 'sketches/a',
    confidence: null,
  });
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

test('importersAt is memoised per commit and helper', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  mkdirSync(join(dir, 'src', 'sketches'), { recursive: true });
  writeFileSync(join(dir, 'src', 'sketches', 'helper.ts'), 'export const x = 1;\n');
  writeFileSync(
    join(dir, 'src', 'sketches', 'a.ts'),
    "import { x } from './helper';\nssam(sketch as never, { x });\n",
  );
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      stdio: 'ignore',
    });
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '--no-verify', '-m', 'one');
  const h = loadHistory(dir);
  const sha = h.commits[0]?.sha ?? '';
  const first = h.importersAt(sha, 'src/sketches/helper.ts');
  assert.deepEqual(first, ['src/sketches/a.ts']);
  // Same array back: the second call never re-runs git grep / git show.
  assert.equal(h.importersAt(sha, 'src/sketches/helper.ts'), first);
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

test('hash narrows the prefix family; family alone when they do not intersect', () => {
  const h = fakeHistory({
    commits: [commitAt('abcdef0123', EXPORT_TS, P('a'), P('out'))],
    prefixFamilies: new Map([['arcs', new Set([P('a'), P('b')])]]),
  });
  const s = shortlist(parseName(`arcs-${exportName}-abcdef0.png`), h);
  assert.equal(s.source, 'prefix+window');
  assert.deepEqual(idsOf(s), ['sketches/a']);
  const miss = fakeHistory({
    commits: [commitAt('abcdef0123', EXPORT_TS - 30 * DAY, P('out'))],
    prefixFamilies: new Map([['arcs', new Set([P('b'), P('c')])]]),
  });
  const alone = shortlist(parseName(`arcs-${exportName}-abcdef0.png`), miss);
  assert.equal(alone.source, 'prefix');
  assert.deepEqual(idsOf(alone), ['sketches/b', 'sketches/c']);
});

test('hash alone when the hash commit misses the window', () => {
  const h = fakeHistory({
    commits: [
      commitAt('abcdef0123', EXPORT_TS - 30 * DAY, P('old')),
      commitAt('w', EXPORT_TS, P('new')),
    ],
  });
  const s = shortlist(parseName(`${exportName}-abcdef0.png`), h);
  assert.equal(s.source, 'hash');
  assert.deepEqual(idsOf(s), ['sketches/old']);
});

test('hash commit with no entry files falls back to the window', () => {
  const h = fakeHistory({
    commits: [commitAt('abcdef0123', EXPORT_TS, P('lib/x')), commitAt('w', EXPORT_TS, P('new'))],
    entryFilesAt: (sha) => new Set(sha === 'w' ? [P('new')] : []),
  });
  const s = shortlist(parseName(`${exportName}-abcdef0.png`), h);
  assert.equal(s.source, 'window');
  assert.deepEqual(idsOf(s), ['sketches/new']);
});

test('deletions are excluded and missing HEAD paths are flagged deleted', () => {
  const h = fakeHistory({
    commits: [
      { sha: 'c1', time: EXPORT_TS, changes: [{ status: 'D', path: P('gone') }] },
      commitAt('c2', EXPORT_TS, P('kept'), P('removed')),
    ],
    existsAtHead: (p) => p !== P('removed'),
  });
  const s = shortlist(parseName(`${exportName}.png`), h);
  assert.deepEqual(
    s.candidates.map((c) => [c.id, c.deleted]),
    [
      ['sketches/kept', false],
      ['sketches/removed', true],
    ],
  );
});

test('de-dup by HEAD id keeps the pathAtExport closest to the export', () => {
  const h = fakeHistory({
    commits: [
      commitAt('far', EXPORT_TS - DAY, P('old')),
      commitAt('near', EXPORT_TS + 1000, P('mid')),
    ],
    current: () => P('new'),
  });
  const s = shortlist(parseName(`${exportName}.png`), h);
  assert.equal(s.candidates.length, 1);
  assert.equal(s.candidates[0]?.pathAtExport, P('mid'));
});

test('unknown prefix uses the window; known family without a timestamp is returned', () => {
  const unknown = shortlist(parseName(`compressO-${exportName}.png`), familyHistory(['x']));
  assert.equal(unknown.source, 'window');
  assert.deepEqual(idsOf(unknown), ['sketches/a', 'sketches/c']);
  const undated = shortlist(
    { ...parseName('arcs-notes.png'), prefix: 'arcs', ts: null },
    familyHistory(['x', 'y']),
  );
  assert.equal(undated.source, 'prefix');
  assert.deepEqual(idsOf(undated), ['sketches/x', 'sketches/y']);
});

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 20 } } });
const metaOf = (buf: Buffer) => sharp(buf).metadata();

await atest('prepareImage fits large images', async () => {
  const m = await metaOf(await prepareImage(await solid(3000, 2000).png().toBuffer()));
  assert.equal(m.format, 'jpeg');
  assert.deepEqual([m.width, m.height], [1568, 1045]);
});

await atest('prepareImage pads thin images', async () => {
  const m = await metaOf(await prepareImage(await solid(1600, 200).png().toBuffer()));
  assert.deepEqual([m.width, m.height], [1568, 280]);
});

await atest('prepareImage keeps a 320 webp at 320', async () => {
  const m = await metaOf(await prepareImage(await solid(320, 320).webp().toBuffer()));
  assert.equal(m.format, 'jpeg');
  assert.deepEqual([m.width, m.height], [320, 320]);
});

test('referenceUrl inserts the transform', () => {
  assert.equal(
    referenceUrl('https://res.cloudinary.com/x/image/upload/v1/a.png'),
    'https://res.cloudinary.com/x/image/upload/w_384,c_limit,f_jpg/v1/a.png',
  );
});

test('outputImageSource handles videos without thumbs and svgs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'osrc-'));
  mkdirSync(join(dir, '.review', 'thumbs'), { recursive: true });
  writeFileSync(join(dir, '.review', 'thumbs', 'a.mp4.webp'), 'x');
  assert.deepEqual(outputImageSource('p.png', dir), { kind: 'file', path: join(dir, 'p.png') });
  assert.deepEqual(outputImageSource('a.mp4', dir), {
    kind: 'thumb',
    path: join(dir, '.review', 'thumbs', 'a.mp4.webp'),
  });
  // No thumbnail yet: try again on a later run rather than storing it as unsupported.
  assert.deepEqual(outputImageSource('b.mov', dir), { kind: 'later', path: null });
  assert.deepEqual(outputImageSource('c.svg', dir), { kind: 'unsupported', path: null });
});

const mkOptions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `c${String(i).padStart(2, '0')}`,
    candidate: {
      id: `sketches/s${i}`,
      path: `src/sketches/s${i}.ts`,
      pathAtExport: `src/sketches/s${i}.ts`,
      deleted: false,
    },
    reference: null,
  }));
const fakeAnswer = (choice: string, keys: string[], tokens: number) => ({
  answers: {
    sketch: {
      type: 'choice' as const,
      choice,
      confidence: 0.9,
      probabilities: Object.fromEntries(
        [...keys, 'none'].map((k) => [k, k === choice ? 0.9 : 0.01]),
      ),
    },
  },
  usage: { input_tokens: tokens },
});
const keysOf = (req: Parameters<AskFn>[0]): string[] => {
  const q = req.questions.sketch as { criteria: Record<string, unknown> };
  return Object.keys(q.criteria).filter((k) => k !== 'none');
};

await atest('askSketch maps keys back to ids', async () => {
  const options = mkOptions(3);
  const ask: AskFn = async (req) => fakeAnswer('c01', keysOf(req), 10);
  const { answer, inputTokens } = await askSketch(ask, Buffer.from('x'), '2023-12-13', options);
  assert.equal(answer.choice, 'sketches/s1');
  assert.deepEqual(Object.keys(answer.probabilities).sort(), [
    'none',
    'sketches/s0',
    'sketches/s1',
    'sketches/s2',
  ]);
  assert.equal(inputTokens, 10);
});

await atest('askSketch batches 30 candidates', async () => {
  const options = mkOptions(30);
  const calls: string[][] = [];
  const ask: AskFn = async (req) => {
    const keys = keysOf(req);
    calls.push(keys);
    return fakeAnswer(keys[1] ?? 'none', keys, 5);
  };
  const { answer, inputTokens } = await askSketch(ask, Buffer.from('x'), 't', options);
  assert.equal(BATCH_SIZE, 12);
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.slice(0, 3).map((c) => c.length),
    [12, 12, 6],
  );
  assert.equal(calls[3]?.length, 3);
  assert.equal(inputTokens, 20);
  assert.equal(answer.choice, 'sketches/s13');
  assert.ok('none' in answer.probabilities);
});

await atest('askSketch returns none when every batch says none', async () => {
  const ask: AskFn = async (req) => fakeAnswer('none', keysOf(req), 1);
  const { answer, inputTokens } = await askSketch(ask, Buffer.from('x'), 't', mkOptions(30));
  assert.equal(answer.choice, null);
  assert.equal(inputTokens, 3);
});

await atest(
  'loadReference pads small renditions to 280 and caches the prepared image',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ref-'));
    const tiny = await solid(120, 90).jpeg().toBuffer();
    let fetched = 0;
    const fakeFetch = async (url: string) => {
      fetched += 1;
      assert.ok(url.includes('/upload/w_384,c_limit,f_jpg/'));
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(tiny).buffer };
    };
    const buf = await loadReference(
      'sketches/a/b',
      'https://x/image/upload/v1/a.png',
      dir,
      fakeFetch,
    );
    const m = await metaOf(buf);
    assert.equal(m.format, 'jpeg');
    assert.deepEqual([m.width, m.height], [280, 280]);
    const again = await loadReference(
      'sketches/a/b',
      'https://x/image/upload/v1/a.png',
      dir,
      fakeFetch,
    );
    assert.equal(fetched, 1);
    assert.deepEqual([(await metaOf(again)).width, (await metaOf(again)).height], [280, 280]);
  },
);

await atest('askSketch throws on an unknown choice label', async () => {
  const ask: AskFn = async () => fakeAnswer('c99', ['c00'], 1);
  await assert.rejects(askSketch(ask, Buffer.from('x'), 't', mkOptions(2)), /unknown choice/);
});

// ---- run loop ----------------------------------------------------------------------------
const fam = (id: string) => `src/sketches/${id}.ts`;
const runHistory: History = {
  commits: [],
  current: (p) => p,
  existsAtHead: () => true,
  entryFilesAt: () => new Set(),
  importersAt: () => [],
  prefixFamilies: new Map([
    ['solo', new Set([fam('a')])],
    ['multi', new Set([fam('a'), fam('b')])],
  ]),
};
const stamp = (prefix: string, i: number) => `${prefix}-2024.03.01-10.00.0${i}.png`;
const emptyRun = () => emptyAttributionFile('jev-1.14.0');
const mkDeps = (over: Partial<RunDeps> = {}): RunDeps & { saves: string[][] } => {
  const saves: string[][] = [];
  const deps: RunDeps = {
    ask: async (req) => fakeAnswer('c00', keysOf(req), 7),
    history: runHistory,
    archive: new Map(),
    loadOutput: async () => Buffer.from('img'),
    loadRef: async () => null,
    now: () => '2026-10-17T00:00:00.000Z',
    save: (d) => saves.push(Object.keys(d.files)),
    ...over,
  };
  return Object.assign(deps, { saves });
};
const runOpts = { concurrency: 1, saveEvery: 10 };
const apiError = <T extends object>(ctor: new (...a: never[]) => T): T =>
  Object.create(ctor.prototype) as T;

await atest('single-member prefix family skips Jev', async () => {
  let asked = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      asked += 1;
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const name = stamp('solo', 1);
  const { data, tokens } = await tagFiles([name], emptyRun(), deps, runOpts);
  const f = data.files[name];
  assert.equal(asked, 0);
  assert.equal(tokens, 0);
  assert.equal(f?.method, 'prefix');
  assert.equal(f?.sketch, 'sketches/a');
  assert.equal(f?.confidence, null);
  assert.deepEqual(f?.candidates, ['sketches/a']);
});

await atest('withhold sends a one-member family to Jev path (no prefix method)', async () => {
  const name = stamp('solo', 1);
  const deps = mkDeps();
  const { data } = await tagFiles([name], emptyRun(), deps, { ...runOpts, withhold: true });
  assert.equal(data.files[name]?.reason, 'no-candidates');
});

await atest('empty shortlist is unlabelled and never asks', async () => {
  let asked = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      asked += 1;
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const name = stamp('nobody', 1);
  const { data } = await tagFiles([name], emptyRun(), deps, runOpts);
  assert.equal(asked, 0);
  assert.equal(data.files[name]?.method, 'unlabelled');
  assert.equal(data.files[name]?.reason, 'no-candidates');
});

await atest('unsupported output is recorded', async () => {
  const name = stamp('multi', 1);
  const deps = mkDeps({ loadOutput: async () => null });
  const { data } = await tagFiles([name], emptyRun(), deps, runOpts);
  assert.equal(data.files[name]?.reason, 'unsupported');
});

await atest('jev answer is held pending without thresholds, accepted with them', async () => {
  const name = stamp('multi', 1);
  const pending = await tagFiles([name], emptyRun(), mkDeps(), runOpts);
  assert.equal(pending.data.files[name]?.reason, 'pending');
  assert.equal(pending.data.files[name]?.answer?.choice, 'sketches/a');
  assert.equal(pending.tokens, 7);
  assert.equal(pending.data.files[name]?.inputTokens, 7);
  const accepted = await tagFiles(
    [name],
    { ...emptyRun(), thresholds: { default: 0.8 } },
    mkDeps(),
    runOpts,
  );
  const f = accepted.data.files[name];
  assert.equal(f?.method, 'jev');
  assert.equal(f?.sketch, 'sketches/a');
  assert.equal(f?.path, 'src/sketches/a.ts');
  assert.equal(f?.inputTokens, 7);
  // The shortlist's paths travel with the answer, so a rethreshold never re-shortlists.
  for (const stored of [pending.data.files[name], f]) {
    assert.deepEqual(Object.keys(stored?.candidatePaths ?? {}).sort(), [
      'sketches/a',
      'sketches/b',
    ]);
    assert.equal(stored?.candidatePaths?.['sketches/b']?.path, 'src/sketches/b.ts');
  }
});

await atest('api 400 is recorded and the run continues', async () => {
  let calls = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      calls += 1;
      if (calls === 1) throw apiError(BadRequestError);
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const names = [stamp('multi', 1), stamp('multi', 2)];
  const { data, errors } = await tagFiles(names, emptyRun(), deps, runOpts);
  assert.equal(errors, 1);
  assert.equal(data.files[names[0] as string]?.reason, 'error');
  assert.equal(data.files[names[1] as string]?.answer?.choice, 'sketches/a');
});

await atest('auth error aborts after saving', async () => {
  let calls = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      calls += 1;
      if (calls === 2) throw apiError(AuthenticationError);
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const names = [stamp('multi', 1), stamp('multi', 2), stamp('multi', 3)];
  await assert.rejects(
    tagFiles(names, emptyRun(), deps, runOpts),
    (e) => e instanceof AuthenticationError,
  );
  assert.equal(calls, 2);
  assert.deepEqual(deps.saves.at(-1), [names[0]]);
});

await atest('404 aborts after saving and is not recorded as error', async () => {
  let calls = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      calls += 1;
      if (calls === 2) throw apiError(NotFoundError);
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const names = [stamp('multi', 1), stamp('multi', 2), stamp('multi', 3)];
  await assert.rejects(
    tagFiles(names, emptyRun(), deps, runOpts),
    (e) => e instanceof NotFoundError,
  );
  assert.deepEqual(deps.saves.at(-1), [names[0]]);
});

await atest('saves atomically and resumes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tag-'));
  const file = join(dir, 'sketches.json');
  const names = [stamp('multi', 1), stamp('multi', 2)];
  const first = await tagFiles(names, emptyRun(), mkDeps(), runOpts);
  writeAttributions(file, first.data);
  assert.equal(existsSync(`${file}.tmp`), false);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), first.data);
  let asked = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      asked += 1;
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  await tagFiles(names, readAttributions(file), deps, runOpts);
  assert.equal(asked, 0);
});

await atest('loadOutput throwing is recorded per file and the run continues', async () => {
  const names = [stamp('multi', 1), stamp('multi', 2)];
  const deps = mkDeps({
    loadOutput: async (n) => {
      if (n === names[0]) throw new Error('corrupt image');
      return Buffer.from('img');
    },
  });
  const { data, errors } = await tagFiles(names, emptyRun(), deps, runOpts);
  assert.equal(data.files[names[0] as string]?.reason, 'unsupported');
  assert.equal(data.files[names[1] as string]?.answer?.choice, 'sketches/a');
  assert.equal(errors, 1);
});

await atest('malformed response is a per-file error', async () => {
  const names = [stamp('multi', 1), stamp('multi', 2)];
  let calls = 0;
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      calls += 1;
      return calls === 1 ? fakeAnswer('c99', keysOf(req), 1) : fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const { data } = await tagFiles(names, emptyRun(), deps, runOpts);
  assert.equal(data.files[names[0] as string]?.reason, 'error');
  assert.equal(data.files[names[1] as string]?.method, 'unlabelled');
  assert.equal(data.files[names[1] as string]?.reason, 'pending');
});

await atest('reference fetch failure skips Jev and records error without an answer', async () => {
  let asked = 0;
  const name = stamp('multi', 1);
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      asked += 1;
      return fakeAnswer('c00', keysOf(req), 1);
    },
    loadRef: async () => {
      throw new Error('HTTP 503');
    },
  });
  const { data, errors, refFailures } = await tagFiles([name], emptyRun(), deps, runOpts);
  assert.equal(asked, 0);
  assert.equal(data.files[name]?.reason, 'error');
  assert.equal(data.files[name]?.answer, undefined);
  assert.equal(errors, 1);
  assert.equal(refFailures, 1);
});

await atest('a video without a thumbnail leaves no entry', async () => {
  let asked = 0;
  const [video, image] = [stamp('multi', 1).replace('.png', '.mp4'), stamp('multi', 2)];
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => {
      asked += 1;
      return fakeAnswer('c00', keysOf(req), 1);
    },
    loadOutput: async (n) => (n === video ? 'later' : Buffer.from('img')),
  });
  const { data, skipped, errors } = await tagFiles([video, image], emptyRun(), deps, runOpts);
  assert.equal(video in data.files, false);
  assert.equal(data.files[image]?.reason, 'pending');
  assert.deepEqual([asked, skipped, errors], [1, 1, 0]);
});

await atest('a rerun re-asks error entries and skips every other stored entry', async () => {
  const asked: string[] = [];
  const deps = mkDeps({
    ask: async (req: SystemOneRequest) => fakeAnswer('c00', keysOf(req), 1),
    loadOutput: async (n) => {
      asked.push(n);
      return Buffer.from('img');
    },
  });
  const [err, pending, jev, unsupported] = [1, 2, 3, 4].map((i) => stamp('multi', i)) as [
    string,
    string,
    string,
    string,
  ];
  const stored = {
    ...emptyRun(),
    files: {
      [err]: entry(undefined, { reason: 'error' }),
      [pending]: entry(answer('sketches/a', 0.5), { reason: 'pending' }),
      [jev]: entry(answer('sketches/a', 0.9), { method: 'jev', series: 'sketches/a' }),
      [unsupported]: entry(undefined, { reason: 'unsupported' }),
    },
  };
  assert.deepEqual(
    [err, pending, jev, unsupported].map((n) => needsTagging(stored, n)),
    [true, false, false, false],
  );
  assert.equal(needsTagging(stored, stamp('multi', 5)), true);
  const { data } = await tagFiles([err, pending, jev, unsupported], stored, deps, runOpts);
  assert.deepEqual(asked, [err]);
  assert.equal(data.files[err]?.reason, 'pending');
  assert.equal(data.files[err]?.answer?.choice, 'sketches/a');
  assert.equal(data.files[unsupported]?.reason, 'unsupported');
});

const pad2 = (n: number) => String(n).padStart(2, '0');
/** A `multi-` export name stamped at `ms`, local time, as the dev runner writes it. */
const stampAt = (ms: number) => {
  const d = new Date(ms);
  return `multi-${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}-${pad2(d.getHours())}.${pad2(d.getMinutes())}.${pad2(d.getSeconds())}.png`;
};

await atest('exports whose git window is still open are skipped, not recorded', async () => {
  const now = '2026-10-17T00:00:00.000Z';
  const [fresh, settled] = [stampAt(Date.parse(now) - DAY), stampAt(Date.parse(now) - 4 * DAY)];
  let asked = 0;
  const deps = mkDeps({
    now: () => now,
    ask: async (req: SystemOneRequest) => {
      asked += 1;
      return fakeAnswer('c00', keysOf(req), 1);
    },
  });
  const { data, skipped } = await tagFiles([fresh, settled], emptyRun(), deps, runOpts);
  assert.equal(fresh in data.files, false);
  assert.equal(data.files[settled]?.reason, 'pending');
  assert.deepEqual([asked, skipped], [1, 1]);
});

test('readAttributions refuses a wrong shape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tag-'));
  const file = join(dir, 'shape.json');
  writeFileSync(file, '{"version":1}');
  assert.throws(
    () => readAttributions(file),
    (e: Error) => e.message.includes(file),
  );
  writeFileSync(file, '{"version":2,"files":{}}');
  assert.throws(
    () => readAttributions(file),
    (e: Error) => e.message.includes(file),
  );
});

test('readAttributions refuses malformed JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tag-'));
  const file = join(dir, 'bad.json');
  writeFileSync(file, '{ nope');
  assert.throws(
    () => readAttributions(file),
    (e: Error) => e.message.includes(file),
  );
  assert.equal(readAttributions(join(dir, 'missing.json')).version, 1);
});

test('rethreshold relabels without asking', () => {
  const name = stamp('multi', 1);
  const base = {
    ...emptyRun(),
    files: { [name]: entry(answer('sketches/a', 0.8), { reason: 'pending' }) },
  };
  const strict = rethreshold(base, () => runHistory, { default: 0.9 });
  assert.equal(strict.files[name]?.reason, 'low-confidence');
  const loose = rethreshold(strict, () => runHistory, { default: 0.7 });
  assert.equal(loose.files[name]?.method, 'jev');
  assert.equal(loose.files[name]?.sketch, 'sketches/a');
  assert.deepEqual(loose.thresholds, { default: 0.7 });
});

/** A history whose every property read is counted (and a getter that counts loads). */
function countingHistory() {
  const counts = { loads: 0, reads: 0 };
  const proxy = new Proxy(runHistory, {
    get(target, key, receiver) {
      counts.reads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const get = () => {
    counts.loads += 1;
    return proxy;
  };
  return { counts, get };
}

test('rethreshold uses stored candidatePaths and never loads history', () => {
  const { counts, get } = countingHistory();
  const stored = {
    'sketches/a': {
      path: 'src/sketches/a.ts',
      pathAtExport: 'src/sketches/old-a.ts',
      deleted: false,
    },
  };
  const files = {
    [stamp('multi', 1)]: entry(answer('sketches/a', 0.8), {
      reason: 'pending',
      candidatePaths: stored,
    }),
    [stamp('multi', 2)]: entry(undefined, { reason: 'no-candidates' }),
    [stamp('multi', 3)]: entry(answer('sketches/a', 0.8), { reason: 'error' }),
    [stamp('multi', 4)]: entry(undefined, { reason: 'unsupported' }),
    [stamp('solo', 1)]: entry(undefined, {
      method: 'prefix',
      sketch: 'sketches/a',
      path: 'src/sketches/a.ts',
    }),
  };
  const out = rethreshold({ ...emptyRun(), files }, get, { default: 0.7 });
  assert.deepEqual(counts, { loads: 0, reads: 0 });
  const f = out.files[stamp('multi', 1)];
  assert.deepEqual(
    [f?.method, f?.path, f?.pathAtExport],
    ['jev', 'src/sketches/a.ts', 'src/sketches/old-a.ts'],
  );
  assert.equal(out.files[stamp('solo', 1)]?.series, 'sketches/a');
  assert.equal(out.files[stamp('multi', 3)]?.reason, 'error');
});

test('rethreshold shortlists only older answered entries, and stores their paths', () => {
  const { counts, get } = countingHistory();
  const legacy = stamp('multi', 1);
  const files = {
    [legacy]: entry(answer('sketches/a', 0.8), { reason: 'pending' }),
    [stamp('multi', 2)]: entry(answer('sketches/a', 0.8), { reason: 'pending' }),
  };
  const out = rethreshold({ ...emptyRun(), files }, get, { default: 0.7 });
  assert.equal(counts.loads, 1);
  assert.equal(out.files[legacy]?.path, 'src/sketches/a.ts');
  assert.deepEqual(out.files[legacy]?.candidatePaths?.['sketches/a'], {
    path: 'src/sketches/a.ts',
    pathAtExport: 'src/sketches/a.ts',
    deleted: false,
  });
  // A second pass finds the stored paths and loads nothing.
  const again = countingHistory();
  rethreshold(out, again.get, { default: 0.5 });
  assert.equal(again.counts.loads, 0);
});

const SK_A = 'sketches/a/one';
const SK_B = 'sketches/b/two';
const skFiles: Record<string, string | null> = {
  '2026.10.10-10.00.00.png': SK_A,
  '2026.10.12-10.00.00.png': SK_A,
  '2026.10.11-10.00.00.png': SK_B,
  '2026.10.09-10.00.00.png': SK_B,
  '2026.10.09-11.00.00.mp4': SK_B,
  '2026.10.13-10.00.00.png': null,
  'stray.png': SK_A,
};
const skNames = Object.keys(skFiles);
const skOf = (n: string): string | null => skFiles[n] ?? null;

test('groups by sketch with unlabelled last', () => {
  const t = buildSketchTimeline(skNames, skOf, 'recent');
  assert.deepEqual(
    t.days.map((d) => d.key),
    [SK_A, SK_B, UNLABELLED],
  );
  assert.deepEqual(
    t.days.map((d) => d.label),
    ['a/one', 'b/two', 'unlabelled'],
  );
  assert.deepEqual(
    t.days.map((d) => d.number),
    [1, 2, 3],
  );
  assert.deepEqual(
    t.days[0]?.items.map((i) => i.name),
    ['2026.10.10-10.00.00.png', '2026.10.12-10.00.00.png', 'stray.png'],
  );
});

test('files missing from the JSON are unlabelled', () => {
  const t = buildSketchTimeline(['2026.10.01-10.00.00.png', 'x.png'], () => null, 'count');
  assert.equal(t.days.length, 1);
  assert.equal(t.days[0]?.key, UNLABELLED);
  assert.equal(t.days[0]?.items.length, 2);
});

test('recent and count orders', () => {
  const recent = buildSketchTimeline(skNames, skOf, 'recent');
  assert.deepEqual(
    recent.days.map((d) => d.key),
    [SK_A, SK_B, UNLABELLED],
  );
  // B has 3 items, A has 3 too: tie goes to recent. Drop one of B to see count differ.
  const more = [...skNames, '2026.10.08-10.00.00.png'];
  const of = (n: string) => (n === '2026.10.08-10.00.00.png' ? SK_B : skOf(n));
  const count = buildSketchTimeline(more, of, 'count');
  assert.deepEqual(
    count.days.map((d) => d.key),
    [SK_B, SK_A, UNLABELLED],
  );
  const tie = buildSketchTimeline(skNames, skOf, 'count');
  assert.deepEqual(
    tie.days.map((d) => d.key),
    [SK_A, SK_B, UNLABELLED],
  );
  // a group with no dated items sorts after dated groups, before unlabelled
  const undatedOnly = buildSketchTimeline(
    ['z.png', ...skNames],
    (n) => (n === 'z.png' ? 'sketches/z' : skOf(n)),
    'recent',
  );
  assert.deepEqual(
    undatedOnly.days.map((d) => d.key),
    [SK_A, SK_B, 'sketches/z', UNLABELLED],
  );
});

test('navigation indices are consistent', () => {
  const t = buildSketchTimeline(skNames, skOf, 'recent');
  assert.equal(t.items.length, skNames.length);
  t.items.forEach((item, i) => {
    assert.equal(item.index, i);
    assert.ok(t.days[t.dayOf[i] ?? -1]?.items.includes(item));
  });
});

test('ledger rows summarise each group', () => {
  const t = buildSketchTimeline(skNames, skOf, 'recent');
  const files = {
    [skNames[0] as string]: { sketch: SK_A, path: 'src/sketches/a/one.ts', deleted: true },
    [skNames[5] as string]: { sketch: null, path: null },
  } as unknown as Parameters<typeof buildLedger>[2];
  const rows = buildLedger(t, new Set(), files);
  assert.deepEqual(
    rows.map((r) => [r.key, r.count]),
    [
      [SK_A, 3],
      [SK_B, 3],
      [UNLABELLED, 1],
    ],
  );
  const a = rows[0];
  assert.equal(a?.path, 'src/sketches/a/one.ts');
  assert.equal(a?.deleted, true);
  assert.equal(a?.first, parseName('2026.10.10-10.00.00.png').ts);
  assert.equal(a?.last, parseName('2026.10.12-10.00.00.png').ts);
  assert.equal(rows[1]?.path, null);
  const u = rows[2];
  assert.equal(u?.path, null);
  assert.equal(u?.deleted, false);
});

test('ledger image prefers a keeper', () => {
  const t = buildSketchTimeline(skNames, skOf, 'recent');
  const rows = buildLedger(t, new Set(['2026.10.10-10.00.00.png']), {});
  assert.equal(rows[0]?.image.name, '2026.10.10-10.00.00.png');
  // no keepers: newest item, i.e. the group's last (undated strays close the group)
  assert.equal(rows[1]?.image.name, '2026.10.11-10.00.00.png');
  assert.equal(rows[0]?.image.name === 'stray.png', false);
  const none = buildLedger(t, new Set(), {});
  assert.equal(none[0]?.image.name, 'stray.png');
});

test('keepers-only input drops empty sketches', () => {
  const kept = new Set(['2026.10.10-10.00.00.png']);
  const t = buildSketchTimeline(
    skNames.filter((n) => kept.has(n)),
    skOf,
    'recent',
  );
  assert.deepEqual(
    t.days.map((d) => d.key),
    [SK_A],
  );
});

/** Labelled entries keyed by filename, for the series-ledger tests. */
function seriesFiles(
  rows: [name: string, sketch: string, path: string, deleted?: boolean][],
): Parameters<typeof buildLedger>[2] {
  return Object.fromEntries(
    rows.map(([name, sketch, path, deleted]) => [
      name,
      entry(undefined, {
        series: seriesOf(sketch),
        sketch,
        path,
        method: 'jev',
        ...(deleted ? { deleted: true } : {}),
      }),
    ]),
  );
}

test('ledger path is the folder for a series', () => {
  const files = seriesFiles([
    ['2026.10.10-10.00.00.png', 'sketches/gravura/basic', 'src/sketches/gravura/basic.ts', true],
    ['2026.10.11-10.00.00.png', 'sketches/gravura/pro-color', 'src/sketches/gravura/pro-color.ts'],
    ['2026.10.12-10.00.00.png', 'sketches/nalee/sketches/bipolar', 'src/sketches/nalee/x.ts', true],
  ]);
  const names = [...Object.keys(files), '2026.10.13-10.00.00.png'];
  const of = (n: string) => (files[n] ? seriesKeyOf(files[n]) : null);
  const rows = buildLedger(buildSketchTimeline(names, of, 'recent'), new Set(), files);
  assert.deepEqual(
    rows.map((r) => [r.key, r.label, r.path, r.deleted, r.count]),
    [
      ['sketches/nalee', 'nalee', 'src/sketches/nalee/', true, 1],
      ['sketches/gravura', 'gravura', 'src/sketches/gravura/', false, 2],
      [UNLABELLED, UNLABELLED, null, false, 1],
    ],
  );
});

test('ledger path is the file for a one-off', () => {
  const files = seriesFiles([
    ['2026.10.10-10.00.00.png', 'sketches/42-loc', 'src/sketches/42-loc.ts'],
    ['2026.10.11-10.00.00.png', 'sketches/42-loc', 'src/sketches/42-loc.ts'],
  ]);
  const of = (n: string) => (files[n] ? seriesKeyOf(files[n]) : null);
  const rows = buildLedger(buildSketchTimeline(Object.keys(files), of, 'recent'), new Set(), files);
  assert.deepEqual(
    rows.map((r) => [r.key, r.label, r.path, r.deleted, r.count]),
    [['sketches/42-loc', '42-loc', 'src/sketches/42-loc.ts', false, 2]],
  );
});

test('old entries without series still group via seriesOf(sketch)', () => {
  const { series: _series, ...old } = entry(undefined, {
    sketch: 'sketches/gravura/basic',
    path: 'src/sketches/gravura/basic.ts',
    method: 'prefix',
  });
  const legacy = old as FileAttribution;
  assert.equal(legacy.series, undefined);
  assert.equal(seriesKeyOf(legacy), 'sketches/gravura');
  assert.equal(seriesKeyOf(entry(undefined)), null);
  assert.equal(seriesKeyOf(entry(undefined, { series: 'sketches/x', sketch: null })), 'sketches/x');

  const files = {
    ...seriesFiles([
      [
        '2026.10.11-10.00.00.png',
        'sketches/gravura/pro-color',
        'src/sketches/gravura/pro-color.ts',
      ],
    ]),
    '2026.10.10-10.00.00.png': legacy,
  };
  const of = (n: string) => (files[n] ? seriesKeyOf(files[n]) : null);
  const t = buildSketchTimeline(Object.keys(files), of, 'recent');
  assert.deepEqual(
    t.days.map((d) => [d.key, d.items.length]),
    [['sketches/gravura', 2]],
  );
  assert.equal(buildLedger(t, new Set(), files)[0]?.path, 'src/sketches/gravura/');
});

const fileStamp = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}-12.00.00`;

function pilotFixture() {
  const names: string[] = [];
  for (let i = 1; i <= 60; i += 1) {
    names.push(`arcs-reduction-${fileStamp(new Date(2025, 9, 1 + (i % 28)))}-${i}.png`);
  }
  for (let i = 1; i <= 5; i += 1)
    names.push(`arcs-reduction-${fileStamp(new Date(2025, 10, i))}.png`);
  for (let i = 1; i <= 50; i += 1)
    names.push(`${fileStamp(new Date(2023, i % 12, 1 + (i % 28)))}.png`);
  for (let i = 1; i <= 20; i += 1)
    names.push(`${fileStamp(new Date(2024, i % 12, 1 + (i % 28)))}.png`);
  for (let i = 1; i <= 40; i += 1)
    names.push(`${fileStamp(new Date(2026, i % 9, 1 + (i % 28)))}.png`);
  names.push(`${fileStamp(new Date(2025, 2, 3))}-abc1234.png`); // one entry file: hash group
  names.push(`${fileStamp(new Date(2025, 2, 4))}-def5678.png`); // two entry files: random
  const history = fakeHistory({
    commits: [
      commitAt('abc1234ffff', EXPORT_TS, P('solo')),
      commitAt('def5678ffff', EXPORT_TS, P('one'), P('two')),
    ],
    prefixFamilies: new Map([['arcs-reduction', new Set([P('arcs/reduction')])]]),
  });
  return { names, history };
}

test('samplePilot is deterministic and capped', () => {
  const { names, history } = pilotFixture();
  const a = samplePilot(names, history, 150, 7);
  const b = samplePilot(names, history, 150, 7);
  assert.deepEqual(a, b);
  const october = a.filter(
    (i) => i.group === 'prefix' && i.name.startsWith('arcs-reduction-2025.10.'),
  );
  assert.ok(october.length > 0 && october.length <= 30, `october arcs ${october.length}`);
  const hand = a.filter((i) => i.group === 'hand');
  assert.equal(hand.length, 30);
  assert.ok(hand.every((i) => /^202[34]\./.test(i.name)));
  assert.equal(new Set(a.map((i) => i.name)).size, a.length);
  assert.equal(a.filter((i) => i.group === 'prefix').length, 30 + 5);
  const hash = a.filter((i) => i.group === 'hash');
  assert.equal(hash.length, 1);
  assert.deepEqual(hash[0]?.truth, ['sketches/solo']);
  assert.equal(
    a.filter((i) => i.group === 'random').length,
    150 - a.filter((i) => i.group !== 'random').length,
  );
  assert.notDeepEqual(
    samplePilot(names, history, 150, 8).filter((i) => i.group === 'random'),
    a.filter((i) => i.group === 'random'),
  );
  // mandatory groups exceed n
  assert.ok(samplePilot(names, history, 10, 7).length > 10);
});

const pItem = (name: string, group: PilotItem['group'], truth: string[] | null): PilotItem => ({
  name,
  group,
  truth,
});
const withAnswer = (choice: string | null, confidence: number) => entry(answer(choice, confidence));

test('scorePilot counts family picks as correct', () => {
  const items = [pItem('f1.png', 'prefix', ['sketches/a', 'sketches/b'])];
  const r = scorePilot(items, { 'f1.png': withAnswer('sketches/b', 0.9) }, {}, [0.5]);
  assert.equal(r.prefix.rows[0]?.correct, 1);
  assert.equal(r.prefix.rows[0]?.precision, 1);
});

test('scorePilot scores at series level', () => {
  const items = [pItem('f1.png', 'prefix', ['sketches/g/a'])];
  const picked = entry(siblings, {});
  const sibling = { ...picked, answer: { ...siblings, choice: 'sketches/g/b' } };
  const r = scorePilot(items, { 'f1.png': sibling }, {}, [0.7, 0.8]);
  assert.deepEqual([r.prefix.rows[0]?.labelled, r.prefix.rows[0]?.precision], [1, 1]);
  assert.deepEqual([r.prefix.rows[1]?.labelled, r.prefix.rows[1]?.precision], [0, null]);
});

test('scorePilot precision and coverage by threshold', () => {
  const items = ['1', '2', '3'].map((n) => pItem(`${n}.png`, 'hash', ['sketches/a']));
  const results = {
    '1.png': withAnswer('sketches/a', 0.95),
    '2.png': withAnswer('sketches/a', 0.75),
    // the wrong pick must out-weigh none for it to be accepted at 0.3
    '3.png': entry({
      choice: 'sketches/x',
      confidence: 0.45,
      probabilities: { 'sketches/x': 0.45, 'sketches/a': 0.25, none: 0.3 },
    }),
  };
  const r = scorePilot(items, results, {}, [0.3, 0.7, 0.9]);
  const [t3, t7, t9] = r.hash.rows;
  assert.deepEqual([t7?.labelled, t7?.correct, t7?.precision, t7?.coverage], [2, 2, 1, 2 / 3]);
  assert.deepEqual([t3?.labelled, t3?.correct, t3?.precision], [3, 2, 2 / 3]);
  assert.deepEqual([t9?.labelled, t9?.precision], [1, 1]);
  assert.equal(r.hash.scored, 3);
});

test('scorePilot counts files without an answer as scored and unlabelled', () => {
  const items = [
    pItem('1.png', 'prefix', ['sketches/a']),
    pItem('2.png', 'prefix', ['sketches/a']),
  ];
  const results = { '1.png': withAnswer('sketches/a', 0.9), '2.png': entry(undefined) };
  const row = scorePilot(items, results, {}, [0.5]).prefix.rows[0];
  assert.deepEqual([row?.labelled, row?.coverage], [1, 0.5]);
});

test('random group is not scored for precision', () => {
  const r = scorePilot(
    [pItem('r.png', 'random', null)],
    { 'r.png': withAnswer('sketches/a', 0.9) },
    {},
    [0.5],
  );
  assert.deepEqual([r.random.rows[0]?.labelled, r.random.rows[0]?.precision], [1, null]);
});

test('applyAccept preserves inputTokens', () => {
  const base = { ...entry(answer('sketches/a', 0.9)), inputTokens: 1234 };
  assert.equal(applyAccept(base, Date.now(), { default: 0.7 }, paths).inputTokens, 1234);
  assert.equal(applyAccept(base, Date.now(), { default: 0.95 }, paths).inputTokens, 1234);
});

test('projectCost reads stored tokens, so a resumed run is right', () => {
  const data = {
    ...emptyAttributionFile('m'),
    files: {
      'a.png': { ...entry(answer('sketches/a', 0.9)), inputTokens: 1000 },
      'b.png': { ...entry(answer('sketches/a', 0.9)), inputTokens: 3000 },
      'c.png': entry(undefined),
    },
  };
  const c = projectCost(data, ['a.png', 'b.png', 'c.png'], 1000);
  assert.deepEqual([c.asked, c.meanTokens], [2, 2000]);
  assert.ok(Math.abs(c.cost - (2000 * 1000 * 0.042) / 1e6) < 1e-12);
  assert.match(formatCost(c, 1000), /tokens per file: 2000 .*\n.*\$0\.08/);
  assert.equal(projectCost(data, ['c.png'], 1000).meanTokens, 0);
});

test('scorePilot reports the none share per group', () => {
  const items = ['1', '2', '3', '4'].map((n) => pItem(`${n}.png`, 'hash', ['sketches/a']));
  const results = {
    '1.png': withAnswer(null, 0.9),
    '2.png': withAnswer(null, 0.2),
    '3.png': withAnswer('sketches/a', 0.9),
    '4.png': entry(undefined),
  };
  const r = scorePilot(items, results, {}, [0.5]);
  assert.equal(r.hash.noneShare, 0.5);
  assert.equal(r.prefix.noneShare, 0);
  assert.match(formatReport(r, ['hash']), /hash \(4 scored, none 50\.0%\)/);
});

test('hand none truth rewards abstaining', () => {
  const items = [
    pItem('h1.png', 'hand', null),
    pItem('h2.png', 'hand', null),
    pItem('h3.png', 'hand', null),
  ];
  const results = {
    'h1.png': withAnswer('sketches/a', 0.9),
    'h2.png': withAnswer('sketches/a', 0.4),
    'h3.png': withAnswer('sketches/a', 0.9),
  };
  const truth = { 'h1.png': null, 'h2.png': null, 'h3.png': 'sketches/a' };
  const r = scorePilot(items, results, truth, [0.7]);
  // h1 accepted against none: wrong; h2 abstained against none: right; h3 accepted and right.
  assert.equal(r.hand.rows[0]?.correct, 2);
  assert.equal(r.hand.rows[0]?.labelled, 2);
  assert.equal(r.hand.rows[0]?.precision, 0.5);
  // an item the human has not labelled yet is not scored
  assert.equal(scorePilot(items, results, { 'h1.png': null }, [0.7]).hand.scored, 1);
});

test('buildPilotSheet lists candidates with reference urls', () => {
  const h = fakeHistory({
    commits: [commitAt('c1', EXPORT_TS, P('a'), P('b'))],
    existsAtHead: (p) => p !== P('b'),
  });
  const archive = new Map([
    ['sketches/a', { id: 'sketches/a', cloudinary: { url: 'https://x/image/upload/v1/a.png' } }],
    ['sketches/b', { id: 'sketches/b', cloudinary: { url: 'https://x/image/upload/v1/b.png' } }],
  ]) as unknown as Parameters<typeof buildPilotSheet>[2];
  const sheet = buildPilotSheet(
    [pItem(`${exportName}.png`, 'hand', null), pItem('other.png', 'random', null)],
    h,
    archive,
  );
  assert.equal(sheet.files.length, 1);
  assert.deepEqual(sheet.files[0]?.candidates, [
    { id: 'sketches/a', path: P('a'), ref: referenceUrl('https://x/image/upload/v1/a.png') },
    { id: 'sketches/b', path: P('b'), ref: null },
  ]);
});

console.log(`${passed} tests passed`);
