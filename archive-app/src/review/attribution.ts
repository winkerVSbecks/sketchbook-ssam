/**
 * Output → sketch attribution: shared types, accept rule and store helpers.
 *
 * Pure TypeScript (no Node or DOM imports): imported by the attribution script
 * under `tsx` and by the Light Table client. An unconfident or `none` answer is
 * stored as unlabelled — the UI never shows a guess.
 */

export type JevAnswer = {
  /** sketch id, or null for `none` */
  choice: string | null;
  confidence: number;
  /** keyed by sketch id, plus 'none' */
  probabilities: Record<string, number>;
};

export type UnlabelledReason =
  'no-candidates' | 'none' | 'low-confidence' | 'error' | 'unsupported' | 'pending';

export type FileAttribution = {
  /** the label: the sketch series (first path segment under `sketches/`); null when unlabelled */
  series: string | null;
  /** the most specific file known: the file itself for `prefix`, Jev's top file in the series otherwise */
  sketch: string | null;
  /** path at HEAD */
  path: string | null;
  /** path when the file was exported, if it differs */
  pathAtExport: string | null;
  deleted?: boolean;
  method: 'prefix' | 'jev' | 'unlabelled';
  reason?: UnlabelledReason;
  confidence: number | null;
  candidates: string[];
  answer?: JevAnswer;
  /** each candidate's paths, stored with the answer so re-thresholding never re-shortlists */
  candidatePaths?: SketchPaths;
  /** input tokens spent asking Jev about this file (all rounds); absent when it never reached Jev */
  inputTokens?: number;
  taggedAt: string;
};

export type Thresholds = {
  default: number;
  /** override per 4-digit year of the export timestamp */
  byYear?: Record<string, number>;
};

export type AttributionFile = {
  version: 1;
  model: string;
  thresholds: Thresholds | null;
  files: Record<string, FileAttribution>;
};

export type SketchPaths = Record<
  string,
  { path: string; pathAtExport: string | null; deleted: boolean }
>;

export function thresholdFor(t: Thresholds, ts: number | null): number {
  if (ts === null) return t.default;
  return t.byYear?.[String(new Date(ts).getFullYear())] ?? t.default;
}

/** Unlabelled reasons a threshold can never change. */
export const SETTLED_REASONS: UnlabelledReason[] = ['error', 'unsupported', 'no-candidates'];

/** Series of a sketch id: the first path segment under `sketches/` (a one-off file is its own). */
export function seriesOf(id: string): string {
  return id.split('/').slice(0, 2).join('/');
}

/** Jev's probabilities summed by series; the `none` bucket stays `none`. */
export function seriesProbabilities(answer: JevAnswer): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const [id, p] of Object.entries(answer.probabilities)) {
    const key = id === 'none' ? 'none' : seriesOf(id);
    sums[key] = (sums[key] ?? 0) + p;
  }
  return sums;
}

/** The top bucket of `seriesProbabilities`, ties broken by key. */
export function topSeries(answer: JevAnswer): { series: string; probability: number } | null {
  const [top] = Object.entries(seriesProbabilities(answer)).sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  );
  return top ? { series: top[0], probability: top[1] } : null;
}

/**
 * Re-derive the label from the stored answer, by series; error-like entries are untouched and
 * prefix entries only gain a missing `series`.
 */
export function applyAccept(
  entry: FileAttribution,
  ts: number | null,
  t: Thresholds,
  paths: SketchPaths,
): FileAttribution {
  const { answer } = entry;
  if (entry.method === 'prefix') {
    return entry.series || !entry.sketch ? entry : { ...entry, series: seriesOf(entry.sketch) };
  }
  if (!answer) return entry;
  if (entry.reason && SETTLED_REASONS.includes(entry.reason)) return entry;

  const { reason: _reason, deleted: _deleted, ...rest } = entry;
  const top = topSeries(answer);
  const accepted = !!top && top.series !== 'none' && top.probability >= thresholdFor(t, ts);
  if (top && accepted) {
    const sketch = Object.entries(answer.probabilities)
      .filter(([id]) => id !== 'none' && seriesOf(id) === top.series)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
    const hit = sketch ? paths[sketch] : undefined;
    return {
      ...rest,
      series: top.series,
      sketch: sketch ?? null,
      path: hit?.path ?? null,
      pathAtExport: hit?.pathAtExport ?? null,
      ...(hit?.deleted ? { deleted: true } : {}),
      method: 'jev',
      confidence: top.probability,
    };
  }
  return {
    ...rest,
    series: null,
    sketch: null,
    path: null,
    pathAtExport: null,
    method: 'unlabelled',
    reason: !top || top.series === 'none' ? 'none' : 'low-confidence',
    confidence: top?.probability ?? answer.confidence,
  };
}

export function emptyAttributionFile(model: string): AttributionFile {
  return { version: 1, model, thresholds: null, files: {} };
}

export function mergeFiles(
  base: AttributionFile,
  updates: Record<string, FileAttribution>,
): AttributionFile {
  return { ...base, files: { ...base.files, ...updates } };
}
