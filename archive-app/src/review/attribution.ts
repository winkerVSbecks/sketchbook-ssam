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

const SETTLED_REASONS: UnlabelledReason[] = ['error', 'unsupported', 'no-candidates'];

/** Re-derive the label from the stored answer; prefix and error-like entries are untouched. */
export function applyAccept(
  entry: FileAttribution,
  ts: number | null,
  t: Thresholds,
  paths: SketchPaths,
): FileAttribution {
  const { answer } = entry;
  if (!answer || entry.method === 'prefix') return entry;
  if (entry.reason && SETTLED_REASONS.includes(entry.reason)) return entry;

  const { reason: _reason, deleted: _deleted, ...rest } = entry;
  const accepted = answer.choice !== null && answer.confidence >= thresholdFor(t, ts);
  if (accepted && answer.choice !== null) {
    const hit = paths[answer.choice];
    return {
      ...rest,
      sketch: answer.choice,
      path: hit?.path ?? null,
      pathAtExport: hit?.pathAtExport ?? null,
      ...(hit?.deleted ? { deleted: true } : {}),
      method: 'jev',
      confidence: answer.confidence,
    };
  }
  return {
    ...rest,
    sketch: null,
    path: null,
    pathAtExport: null,
    method: 'unlabelled',
    reason: answer.choice === null ? 'none' : 'low-confidence',
    confidence: answer.confidence,
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
