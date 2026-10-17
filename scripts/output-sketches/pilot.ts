/**
 * Pilot for output → sketch attribution: sample files whose sketch is known (or hand-labelled),
 * score Jev's stored answers against that truth at each threshold, and describe the hand-labelling
 * sheet. Pure functions; the CLI (`scripts/tag-output.ts`) owns the files and the API.
 */
import type { AttributionFile, FileAttribution } from '../../archive-app/src/review/attribution.ts';
import { parseName } from '../../archive-app/src/review/model.ts';
import type { SketchEntry } from '../archive-types.ts';
import { sketchIdOf, type History } from './history.ts';
import { referenceUrl } from './images.ts';
import { COST_PER_MTOK } from './run.ts';
import { shortlist } from './shortlist.ts';

export type PilotGroup = 'prefix' | 'hash' | 'random' | 'hand';

export type PilotItem = {
  name: string;
  group: PilotGroup;
  /** Acceptable sketch ids: a prefix family, one hash sketch, or null (random, hand). */
  truth: string[] | null;
};

export const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
export const HAND_COUNT = 30;
export const ARCS_CAP = 30;
const GROUPS: PilotGroup[] = ['prefix', 'hash', 'hand', 'random'];

/** `k` items spread evenly across `list` (all of it when it is no longer than `k`). */
function stride<T>(list: T[], k: number): T[] {
  if (list.length <= k) return list;
  return Array.from({ length: k }, (_, i) => list[Math.floor((i * list.length) / k)] as T);
}

/** mulberry32: a small seeded PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The one entry file a commit touches, or null when it touches none or several. */
function soleEntryFile(history: History, hash: string): string | null {
  const commit = history.commits.find((c) => c.sha.startsWith(hash));
  if (!commit) return null;
  const entries = history.entryFilesAt(commit.sha);
  const touched = new Set(
    commit.changes.filter((c) => c.status !== 'D' && entries.has(c.path)).map((c) => c.path),
  );
  const [only] = touched;
  return touched.size === 1 && only ? only : null;
}

export function samplePilot(
  names: string[],
  history: History,
  n: number,
  seed: number,
): PilotItem[] {
  const sorted = [...names].sort();
  const items: PilotItem[] = [];
  const used = new Set<string>();
  const take = (item: PilotItem) => {
    items.push(item);
    used.add(item.name);
  };

  const arcs: PilotItem[] = [];
  for (const name of sorted) {
    const p = parseName(name);
    const family = p.prefix ? history.prefixFamilies.get(p.prefix) : undefined;
    if (!p.prefix || !family?.size) continue;
    const item: PilotItem = {
      name,
      group: 'prefix',
      truth: [...new Set([...family].map((f) => sketchIdOf(history.current(f))))],
    };
    const octoberArcs =
      p.prefix === 'arcs-reduction' &&
      p.ts !== null &&
      new Date(p.ts).getFullYear() === 2025 &&
      new Date(p.ts).getMonth() === 9;
    if (octoberArcs) arcs.push(item);
    else take(item);
  }
  for (const item of stride(arcs, ARCS_CAP)) take(item);

  for (const name of sorted) {
    if (used.has(name)) continue;
    const { hash } = parseName(name);
    const entry = hash ? soleEntryFile(history, hash) : null;
    if (entry) take({ name, group: 'hash', truth: [sketchIdOf(history.current(entry))] });
  }

  const early = sorted.filter((name) => {
    const { ts } = parseName(name);
    return !used.has(name) && ts !== null && [2023, 2024].includes(new Date(ts).getFullYear());
  });
  for (const name of stride(early, HAND_COUNT)) take({ name, group: 'hand', truth: null });

  const rest = sorted.filter((name) => !used.has(name));
  const next = rng(seed);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [rest[i], rest[j]] = [rest[j] as string, rest[i] as string];
  }
  for (const name of rest.slice(0, Math.max(0, n - items.length))) {
    take({ name, group: 'random', truth: null });
  }
  return items;
}

export type ReportRow = {
  threshold: number;
  /** Accepted: a choice at or above the threshold. */
  labelled: number;
  /** Items judged right: accepted into the truth, or (hand, null truth) left unlabelled. */
  correct: number;
  /** Accepted-and-right over accepted; null when nothing was accepted. */
  precision: number | null;
  /** Accepted over scored. */
  coverage: number;
};

export type GroupReport = { scored: number; rows: ReportRow[] };
export type Report = Record<PilotGroup, GroupReport>;

export function scorePilot(
  items: PilotItem[],
  results: Record<string, FileAttribution>,
  truth: Record<string, string | null>,
  thresholds: number[] = THRESHOLDS,
): Report {
  const report = {} as Report;
  for (const group of GROUPS) {
    const scoredItems = items.flatMap((item) => {
      const entry = results[item.name];
      if (item.group !== group || !entry) return [];
      if (group !== 'hand') return [{ entry, want: item.truth }];
      return item.name in truth ? [{ entry, want: truth[item.name] ?? null, hand: true }] : [];
    });
    const rows = thresholds.map((threshold): ReportRow => {
      let labelled = 0;
      let hits = 0;
      let abstainedRight = 0;
      for (const s of scoredItems) {
        const a = s.entry.answer;
        const accepted = !!a && a.choice !== null && a.confidence >= threshold;
        if (accepted) labelled += 1;
        if (group === 'random') continue;
        const want = typeof s.want === 'string' ? [s.want] : s.want;
        if (accepted && a?.choice && want?.includes(a.choice)) hits += 1;
        else if (!accepted && 'hand' in s && s.want === null) abstainedRight += 1;
      }
      return {
        threshold,
        labelled,
        correct: hits + abstainedRight,
        precision: labelled && group !== 'random' ? hits / labelled : null,
        coverage: scoredItems.length ? labelled / scoredItems.length : 0,
      };
    });
    report[group] = { scored: scoredItems.length, rows };
  }
  return report;
}

const pct = (v: number | null): string => (v === null ? '-' : `${(v * 100).toFixed(1)}%`);

/** One table per group: threshold | labelled | correct | precision | coverage. */
export function formatReport(report: Report, groups: PilotGroup[] = GROUPS): string {
  return groups
    .map((g) => {
      const head = `${g} (${report[g].scored} scored)\nthreshold  labelled  correct  precision  coverage`;
      const rows = report[g].rows.map(
        (r) =>
          `${r.threshold.toFixed(2).padEnd(9)}  ${String(r.labelled).padStart(8)}  ${
            g === 'random' ? '-'.padStart(7) : String(r.correct).padStart(7)
          }  ${pct(r.precision).padStart(9)}  ${pct(r.coverage).padStart(8)}`,
      );
      return [head, ...rows].join('\n');
    })
    .join('\n\n');
}

/** Mean input tokens per file that reached Jev, and the projected cost over `mediaCount` files. */
export function projectCost(
  data: AttributionFile,
  names: string[],
  tokens: number,
  mediaCount: number,
): { asked: number; meanTokens: number; cost: number } {
  const asked = names.filter((n) => data.files[n]?.answer).length;
  const meanTokens = asked ? tokens / asked : 0;
  return { asked, meanTokens, cost: (meanTokens * mediaCount * COST_PER_MTOK) / 1e6 };
}

export type PilotSheetFile = {
  name: string;
  candidates: { id: string; path: string; ref: string | null }[];
};
export type PilotSheetData = { files: PilotSheetFile[] };

/** The `/pilot` page's data: each hand item with its shortlist and archive reference pictures. */
export function buildPilotSheet(
  items: PilotItem[],
  history: History,
  archive: Map<string, SketchEntry>,
): PilotSheetData {
  return {
    files: items
      .filter((i) => i.group === 'hand')
      .map((i) => ({
        name: i.name,
        candidates: shortlist(parseName(i.name), history, { withhold: false }).candidates.map(
          (c) => {
            const url = archive.get(c.id)?.cloudinary?.url;
            return { id: c.id, path: c.path, ref: url && !c.deleted ? referenceUrl(url) : null };
          },
        ),
      })),
  };
}
