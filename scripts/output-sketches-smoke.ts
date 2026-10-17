/**
 * Node smoke test for output → sketch attribution (shared types, accept rule, store).
 * Run: `npx tsx scripts/output-sketches-smoke.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthenticationError, BadRequestError, type SystemOneRequest } from '@typesafe-ai/sdk';
import sharp from 'sharp';
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
import {
  loadReference,
  outputImageSource,
  prepareImage,
  referenceUrl,
} from './output-sketches/images.ts';
import { askSketch, BATCH_SIZE, type AskFn } from './output-sketches/jev.ts';
import {
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
  assert.deepEqual(outputImageSource('b.mov', dir), { kind: 'unsupported', path: null });
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
  const strict = rethreshold(base, runHistory, { default: 0.9 });
  assert.equal(strict.files[name]?.reason, 'low-confidence');
  const loose = rethreshold(strict, runHistory, { default: 0.7 });
  assert.equal(loose.files[name]?.method, 'jev');
  assert.equal(loose.files[name]?.sketch, 'sketches/a');
  assert.deepEqual(loose.thresholds, { default: 0.7 });
});

console.log(`${passed} tests passed`);
