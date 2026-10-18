/**
 * The attribution run loop: for each output file, decide whether its sketch is certain from the
 * prefix family, otherwise ask Jev over the shortlist and apply the stored thresholds.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  APIConnectionError,
  APIError,
  BadRequestError,
  UnprocessableEntityError,
} from '@typesafe-ai/sdk';
import {
  applyAccept,
  seriesOf,
  emptyAttributionFile,
  SETTLED_REASONS,
  mergeFiles,
  type AttributionFile,
  type FileAttribution,
  type SketchPaths,
  type Thresholds,
} from '../../archive-app/src/review/attribution.ts';
import { parseName } from '../../archive-app/src/review/model.ts';
import type { SketchEntry } from '../archive-types.ts';
import type { History } from './history.ts';
import { askSketch, MODEL, type AskFn, type SketchOption } from './jev.ts';
import { shortlist, type Candidate } from './shortlist.ts';

export const SKETCHES_JSON = 'output/.review/sketches.json';
/** Dollars per million input tokens. */
export const COST_PER_MTOK = 0.042;

export function readAttributions(path: string): AttributionFile {
  if (!existsSync(path)) return emptyAttributionFile(MODEL);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot parse ${path}: ${(err as Error).message}`);
  }
  const shaped = parsed as Partial<AttributionFile> | null;
  if (shaped?.version !== 1 || typeof shaped.files !== 'object' || shaped.files === null) {
    throw new Error(`Unexpected shape in ${path}: need version 1 and a files object`);
  }
  return shaped as AttributionFile;
}

export function writeAttributions(path: string, data: AttributionFile): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

export type RunDeps = {
  ask: AskFn;
  history: History;
  archive: Map<string, SketchEntry>;
  loadOutput: (name: string) => Promise<Buffer | null>;
  loadRef: (c: Candidate) => Promise<Buffer | null>;
  now: () => string;
  save: (data: AttributionFile) => void;
};

export type RunOptions = { concurrency: number; withhold?: boolean; saveEvery: number };

export type RunResult = {
  data: AttributionFile;
  tokens: number;
  /** Files recorded as a per-file failure (error, or an output that could not be read). */
  errors: number;
  /** Of those, files skipped because an archive reference could not be fetched. */
  refFailures: number;
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD HH:MM`, the form the model is told the export time in. */
function formatExportedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pathsOf = (candidates: Candidate[]): SketchPaths =>
  Object.fromEntries(
    candidates.map((c) => [
      c.id,
      { path: c.path, pathAtExport: c.pathAtExport, deleted: c.deleted },
    ]),
  );

function unlabelled(
  reason: NonNullable<FileAttribution['reason']>,
  candidates: string[],
  taggedAt: string,
): FileAttribution {
  return {
    series: null,
    sketch: null,
    path: null,
    pathAtExport: null,
    method: 'unlabelled',
    reason,
    confidence: null,
    candidates,
    taggedAt,
  };
}

type One = { entry: FileAttribution; tokens: number; failure?: 'file' | 'ref' };

/** Failures that say nothing about one file: stop (after a save) and let a rerun resume. */
function isFatal(err: unknown): boolean {
  if (err instanceof BadRequestError || err instanceof UnprocessableEntityError) return false;
  // Any other API error (401, 403, 404, 429, 5xx, ...) may be request-wide: abort, resume later.
  return err instanceof APIError || err instanceof APIConnectionError;
}

async function tagOne(
  name: string,
  data: AttributionFile,
  deps: RunDeps,
  withhold: boolean,
): Promise<One> {
  const taggedAt = deps.now();
  const parsed = parseName(name);
  const { candidates } = shortlist(parsed, deps.history, { withhold });
  const ids = candidates.map((c) => c.id);

  const family = parsed.prefix ? deps.history.prefixFamilies.get(parsed.prefix) : undefined;
  const only = candidates[0];
  if (!withhold && family?.size === 1 && only) {
    return {
      tokens: 0,
      entry: {
        series: seriesOf(only.id),
        sketch: only.id,
        path: only.path,
        pathAtExport: only.pathAtExport,
        ...(only.deleted ? { deleted: true } : {}),
        method: 'prefix',
        confidence: null,
        candidates: [only.id],
        taggedAt,
      },
    };
  }
  if (candidates.length === 0 || parsed.ts === null) {
    return { tokens: 0, entry: unlabelled('no-candidates', ids, taggedAt) };
  }

  let output: Buffer | null;
  try {
    output = await deps.loadOutput(name);
  } catch {
    return { tokens: 0, failure: 'file', entry: unlabelled('unsupported', ids, taggedAt) };
  }
  if (!output) return { tokens: 0, entry: unlabelled('unsupported', ids, taggedAt) };

  // null means "no reference exists"; a rejection means the fetch failed, so do not ask.
  let options: SketchOption[];
  try {
    options = await Promise.all(
      candidates.map(async (candidate, i) => ({
        key: `c${i}`,
        candidate,
        reference: await deps.loadRef(candidate),
      })),
    );
  } catch {
    return { tokens: 0, failure: 'ref', entry: unlabelled('error', ids, taggedAt) };
  }

  try {
    const round = await askSketch(deps.ask, output, formatExportedAt(parsed.ts), options);
    const candidatePaths = pathsOf(candidates);
    const pending: FileAttribution = {
      ...unlabelled('pending', ids, taggedAt),
      answer: round.answer,
      candidatePaths,
      inputTokens: round.inputTokens,
    };
    const entry = data.thresholds
      ? applyAccept(pending, parsed.ts, data.thresholds, candidatePaths)
      : pending;
    return { entry, tokens: round.inputTokens };
  } catch (err) {
    if (isFatal(err)) throw err;
    // 400/422 for this file, or a malformed response: record it so a rerun does not stall on it.
    return { tokens: 0, failure: 'file', entry: unlabelled('error', ids, taggedAt) };
  }
}

export async function tagFiles(
  names: string[],
  data: AttributionFile,
  deps: RunDeps,
  opts: RunOptions,
): Promise<RunResult> {
  const todo = names.filter((n) => !(n in data.files));
  const updates: Record<string, FileAttribution> = {};
  let tokens = 0;
  let errors = 0;
  let refFailures = 0;
  let finished = 0;
  let next = 0;
  let fatal: unknown;
  let failed = false;

  const snapshot = () => mergeFiles(data, updates);

  async function worker(): Promise<void> {
    while (!failed) {
      const name = todo[next++];
      if (name === undefined) return;
      try {
        const one = await tagOne(name, data, deps, opts.withhold ?? false);
        updates[name] = one.entry;
        tokens += one.tokens;
        if (one.failure) errors += 1;
        if (one.failure === 'ref') refFailures += 1;
        finished += 1;
        if (finished % opts.saveEvery === 0) deps.save(snapshot());
      } catch (err) {
        if (!failed) fatal = err;
        failed = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  const result = snapshot();
  deps.save(result);
  if (failed) throw fatal;
  return { data: result, tokens, errors, refFailures };
}

/**
 * Re-derive every stored label from its stored answer. No API calls. Paths come from each
 * entry's `candidatePaths`; only an older answered entry without them is shortlisted again (and
 * gains them), so `getHistory` is called at most once, and not at all when nothing needs it.
 */
export function rethreshold(
  data: AttributionFile,
  getHistory: () => History,
  t: Thresholds,
): AttributionFile {
  let history: History | undefined;
  const files: Record<string, FileAttribution> = {};
  for (const [name, entry] of Object.entries(data.files)) {
    const { ts } = parseName(name);
    if (entry.method === 'prefix') {
      files[name] = applyAccept(entry, ts, t, {});
      continue;
    }
    if (!entry.answer || (entry.reason && SETTLED_REASONS.includes(entry.reason))) {
      files[name] = entry;
      continue;
    }
    let candidatePaths = entry.candidatePaths;
    if (!candidatePaths) {
      history ??= getHistory();
      candidatePaths = pathsOf(shortlist(parseName(name), history).candidates);
    }
    files[name] = applyAccept({ ...entry, candidatePaths }, ts, t, candidatePaths);
  }
  return { ...data, thresholds: t, files };
}

export function summarize(data: AttributionFile, tokens: number): string {
  const labelled: Record<string, number> = {};
  const unlabelledBy: Record<string, number> = {};
  for (const f of Object.values(data.files)) {
    if (f.method === 'unlabelled') {
      const r = f.reason ?? 'unknown';
      unlabelledBy[r] = (unlabelledBy[r] ?? 0) + 1;
    } else labelled[f.method] = (labelled[f.method] ?? 0) + 1;
  }
  const fmt = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none';
  return [
    `labelled:   ${fmt(labelled)}`,
    `unlabelled: ${fmt(unlabelledBy)}`,
    `input tokens: ${tokens}  cost: $${((tokens / 1e6) * COST_PER_MTOK).toFixed(4)}`,
  ].join('\n');
}
