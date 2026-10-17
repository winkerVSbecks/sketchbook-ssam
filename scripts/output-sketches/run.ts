/**
 * The attribution run loop: for each output file, decide whether its sketch is certain from the
 * prefix family, otherwise ask Jev over the shortlist and apply the stored thresholds.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  UnprocessableEntityError,
} from '@typesafe-ai/sdk';
import {
  applyAccept,
  emptyAttributionFile,
  mergeFiles,
  type AttributionFile,
  type FileAttribution,
  type SketchPaths,
  type Thresholds,
} from '../../archive-app/src/review/attribution.ts';
import { parseName } from '../../archive-app/src/review/model.ts';
import type { SketchEntry } from '../archive-types.ts';
import type { History } from './history.ts';
import { askSketch, MODEL, type AskFn } from './jev.ts';
import { shortlist, type Candidate } from './shortlist.ts';

export const SKETCHES_JSON = 'output/.review/sketches.json';
/** Dollars per million input tokens. */
export const COST_PER_MTOK = 0.042;

export function readAttributions(path: string): AttributionFile {
  if (!existsSync(path)) return emptyAttributionFile(MODEL);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AttributionFile;
  } catch (err) {
    throw new Error(`Cannot parse ${path}: ${(err as Error).message}`);
  }
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

export type RunResult = { data: AttributionFile; tokens: number; errors: number };

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

type One = { entry: FileAttribution; tokens: number };

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

  const output = await deps.loadOutput(name);
  if (!output) return { tokens: 0, entry: unlabelled('unsupported', ids, taggedAt) };

  try {
    const options = await Promise.all(
      candidates.map(async (candidate, i) => ({
        key: `c${i}`,
        candidate,
        reference: await deps.loadRef(candidate).catch(() => null),
      })),
    );
    const round = await askSketch(deps.ask, output, formatExportedAt(parsed.ts), options);
    const pending: FileAttribution = {
      ...unlabelled('pending', ids, taggedAt),
      answer: round.answer,
    };
    const entry = data.thresholds
      ? applyAccept(pending, parsed.ts, data.thresholds, pathsOf(candidates))
      : pending;
    return { entry, tokens: round.inputTokens };
  } catch (err) {
    if (err instanceof BadRequestError || err instanceof UnprocessableEntityError) {
      return { tokens: 0, entry: unlabelled('error', ids, taggedAt) };
    }
    throw err; // auth, permission and anything unexpected abort the run after a save
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
        if (one.entry.reason === 'error') errors += 1;
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
  return { data: result, tokens, errors };
}

/** Re-derive every stored label from its stored answer. No API calls. */
export function rethreshold(
  data: AttributionFile,
  history: History,
  t: Thresholds,
): AttributionFile {
  const files: Record<string, FileAttribution> = {};
  for (const [name, entry] of Object.entries(data.files)) {
    const parsed = parseName(name);
    const { candidates } = shortlist(parsed, history);
    files[name] = applyAccept(entry, parsed.ts, t, pathsOf(candidates));
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
