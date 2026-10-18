import 'dotenv/config';
/**
 * `npm run tag:output -- [flags]` — attribute each file in `output/` to the sketch that rendered
 * it, writing `output/.review/sketches.json`.
 *
 *   --force                 clear stored attributions first
 *   --limit N               tag at most N new files
 *   --threshold 0.7         default accept confidence
 *   --threshold-year Y=0.85 per-year override (repeatable)
 *   --rethreshold           re-apply thresholds to stored answers, no API calls
 *   --pilot N               run Jev on a sample with known answers (plus 30 files from 2023-24 to
 *                           hand-label at /pilot); writes pilot-*.json, never sketches.json
 *   --pilot-report          re-print the pilot report from the stored files, no API calls
 *   --review-dir DIR        where pilot files live (default output/.review)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { AttributionFile, Thresholds } from '../archive-app/src/review/attribution.ts';
import type { Archive, SketchEntry } from './archive-types.ts';
import { loadHistory } from './output-sketches/history.ts';
import { loadReference, outputImageSource, prepareImage } from './output-sketches/images.ts';
import { makeAsk, MODEL } from './output-sketches/jev.ts';
import {
  buildPilotSheet,
  formatCost,
  formatReport,
  projectCost,
  samplePilot,
  scorePilot,
  THRESHOLDS,
  type PilotItem,
} from './output-sketches/pilot.ts';
import {
  readAttributions,
  rethreshold,
  SKETCHES_JSON,
  summarize,
  tagFiles,
  writeAttributions,
  type RunDeps,
} from './output-sketches/run.ts';

const OUTPUT_DIR = 'output';
const REFS_DIR = 'output/.review/refs';
const ARCHIVE_JSON = 'archive-app/archive.json';
const CONCURRENCY = 4;
const SAVE_EVERY = 10;

const { values: flags } = parseArgs({
  options: {
    force: { type: 'boolean', default: false },
    limit: { type: 'string' },
    threshold: { type: 'string' },
    'threshold-year': { type: 'string', multiple: true },
    rethreshold: { type: 'boolean', default: false },
    pilot: { type: 'string' },
    'pilot-report': { type: 'boolean', default: false },
    'review-dir': { type: 'string', default: 'output/.review' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseNumber(label: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1)
    fail(`${label}: expected a number from 0 to 1, got "${raw}"`);
  return n;
}

/** Stored thresholds overlaid with any passed on the command line. */
function resolveThresholds(stored: Thresholds | null): Thresholds | null {
  const byYear: Record<string, number> = { ...stored?.byYear };
  for (const raw of flags['threshold-year'] ?? []) {
    const [year, value] = raw.split('=');
    if (!year || !/^\d{4}$/.test(year) || value === undefined) {
      fail(`--threshold-year: expected YYYY=0.x, got "${raw}"`);
    }
    byYear[year] = parseNumber('--threshold-year', value);
  }
  const base =
    flags.threshold !== undefined ? parseNumber('--threshold', flags.threshold) : stored?.default;
  if (base === undefined) return null;
  return { default: base, ...(Object.keys(byYear).length ? { byYear } : {}) };
}

const MEDIA_EXT = /\.(png|jpe?g|webp|gif|svg|mp4|mov|webm)$/i;

const listMedia = (): string[] =>
  readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.') && MEDIA_EXT.test(e.name))
    .map((e) => e.name)
    .sort();

function loadArchive(): Map<string, SketchEntry> {
  if (!existsSync(ARCHIVE_JSON)) return new Map();
  const archive = JSON.parse(readFileSync(ARCHIVE_JSON, 'utf8')) as Archive;
  return new Map(archive.sketches.map((s) => [s.id, s]));
}

const PILOT_SEED = 1;
const reviewDir = flags['review-dir'] ?? 'output/.review';
const pilotPath = (file: string): string => join(reviewDir, file);

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    return fail(`Cannot parse ${path}: ${(err as Error).message}`);
  }
}

function printPilotReport(): void {
  const items = readJson<PilotItem[] | null>(pilotPath('pilot-items.json'), null);
  if (!items) fail(`No pilot found at ${pilotPath('pilot-items.json')}. Run --pilot N first.`);
  const results = readAttributions(pilotPath('pilot-results.json'));
  const truth = readJson<Record<string, string | null>>(pilotPath('pilot-truth.json'), {});
  console.log(formatReport(scorePilot(items, results.files, truth, THRESHOLDS)));
  const media = listMedia().length;
  const names = items.map((i) => i.name);
  console.log(`\n${formatCost(projectCost(results, names, media), media)}`);
}

function makeDeps(
  history: RunDeps['history'],
  archive: RunDeps['archive'],
  save: RunDeps['save'],
): RunDeps {
  return {
    ask: makeAsk(new TypeSafeClient()),
    history,
    archive,
    loadOutput: async (name) => {
      const src = outputImageSource(name, OUTPUT_DIR);
      if (src.kind === 'unsupported' || !src.path) return null;
      return prepareImage(readFileSync(src.path));
    },
    loadRef: async (c) => {
      const url = archive.get(c.id)?.cloudinary?.url;
      // loadReference applies referenceUrl itself.
      return url && !c.deleted ? loadReference(c.id, url, REFS_DIR) : null;
    },
    now: () => new Date().toISOString(),
    save,
  };
}

async function runPilot(raw: string): Promise<void> {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) fail(`--pilot: expected a positive integer, got "${raw}"`);
  const history = loadHistory(process.cwd());
  const archive = loadArchive();
  const media = listMedia();
  const items = samplePilot(media, history, n, PILOT_SEED);
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.group] = (counts[i.group] ?? 0) + 1;
  console.log(
    `pilot sample: ${items.length} file(s) (${Object.entries(counts)
      .map(([g, c]) => `${g} ${c}`)
      .join(', ')})`,
  );

  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(pilotPath('pilot-items.json'), `${JSON.stringify(items, null, 2)}\n`);
  writeFileSync(
    pilotPath('pilot.json'),
    `${JSON.stringify(buildPilotSheet(items, history, archive), null, 2)}\n`,
  );

  // Pilot answers stay raw (no thresholds) and never touch sketches.json.
  const resultsPath = pilotPath('pilot-results.json');
  const data: AttributionFile = {
    ...readAttributions(resultsPath),
    model: MODEL,
    thresholds: null,
  };
  const deps = makeDeps(history, archive, (d) => writeAttributions(resultsPath, d));
  const names = items.map((i) => i.name);
  const result = await tagFiles(names, data, deps, {
    concurrency: CONCURRENCY,
    saveEvery: SAVE_EVERY,
    withhold: true,
  });

  const truth = readJson<Record<string, string | null>>(pilotPath('pilot-truth.json'), {});
  console.log(
    formatReport(scorePilot(items, result.data.files, truth, THRESHOLDS), ['prefix', 'hash']),
  );
  console.log(`\n${formatCost(projectCost(result.data, names, media.length), media.length)}`);
  if (result.errors) console.log(`errors recorded: ${result.errors}`);
  console.log(
    'Label the 2023–24 files at http://localhost:5180/pilot (npm run review), then run npm run tag:output -- --pilot-report',
  );
}

async function main(): Promise<void> {
  if (flags['pilot-report']) return printPilotReport();
  if (flags.pilot !== undefined) return runPilot(flags.pilot);

  const stored = readAttributions(SKETCHES_JSON);
  const thresholds = resolveThresholds(stored.thresholds);
  const save = (d: AttributionFile) => {
    mkdirSync(dirname(resolve(SKETCHES_JSON)), { recursive: true });
    writeAttributions(SKETCHES_JSON, d);
  };

  if (flags.rethreshold) {
    if (!thresholds) fail('No thresholds set. Pass --threshold 0.x [--threshold-year 2024=0.y].');
    // History loads only if an older entry lacks stored candidate paths.
    const next = rethreshold(
      { ...stored, model: MODEL },
      () => loadHistory(process.cwd()),
      thresholds,
    );
    save(next);
    console.log(summarize(next, 0));
    return;
  }

  if (!thresholds) {
    fail(
      'No thresholds set. Run the pilot first (npm run tag:output -- --pilot N), then pass --threshold 0.x [--threshold-year 2024=0.y].',
    );
  }

  const history = loadHistory(process.cwd());
  let data: AttributionFile = { ...stored, model: MODEL, files: flags.force ? {} : stored.files };
  data = rethreshold(data, () => history, thresholds);

  let names = listMedia().filter((n) => !(n in data.files));
  if (flags.limit !== undefined) {
    const n = Number(flags.limit);
    if (!Number.isInteger(n) || n < 1)
      fail(`--limit: expected a positive integer, got "${flags.limit}"`);
    names = names.slice(0, n);
  }

  const deps = makeDeps(history, loadArchive(), save);

  console.log(`tagging ${names.length} file(s)`);
  const result = await tagFiles(names, data, deps, {
    concurrency: CONCURRENCY,
    saveEvery: SAVE_EVERY,
  });
  console.log(summarize(result.data, result.tokens));
  if (result.errors) console.log(`errors recorded: ${result.errors}`);
  console.log(`reference fetch failures: ${result.refFailures}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
