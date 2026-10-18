/**
 * Filename → timeline model for the Light Table.
 *
 * ssam exports are stamped `YYYY.MM.DD-HH.MM.SS`, optionally wrapped by a
 * sketch prefix (`arcs-reduction-…`) and/or a trailing git short-hash
 * (`…-fc2ca76`). CleanShot recordings use `YYYY-MM-DD at HH.MM.SS`. Anything
 * else is a stray and lands in the trailing `undated` group.
 *
 * The stream is strictly chronological (ascending); `→` always moves forward
 * in time. The app starts on the most recent day.
 */

import { applyAccept, seriesOf, type AttributionFile, type FileAttribution } from './attribution';

export type Item = {
  name: string;
  /** lowercase extension without the dot, e.g. "png" */
  ext: string;
  kind: 'image' | 'video';
  /** sketch prefix when the stamp is wrapped, e.g. "arcs-reduction" */
  prefix: string | null;
  /** trailing git short-hash when present */
  hash: string | null;
  /** ms epoch; null for undated strays */
  ts: number | null;
  /** day key: "2026.05.17", or "undated" */
  dayKey: string;
  /** index into the flat chronological stream */
  index: number;
};

export type Day = {
  key: string;
  /** "2026.05.17 · Sat" or "undated" */
  label: string;
  items: Item[];
  /** this day's position, e.g. 184 of 252 (1-based) */
  number: number;
};

export type Timeline = {
  items: Item[];
  days: Day[];
  /** day array index for each item index */
  dayOf: number[];
};

const VIDEO_EXT = new Set(['mp4', 'mov', 'webm']);

const STAMP = /(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/;
const CLEANSHOT = /(\d{4})-(\d{2})-(\d{2}) at (\d{2})\.(\d{2})\.(\d{2})/;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Parsed = Omit<Item, 'index'>;

export function parseName(name: string): Parsed {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  const base = dot === -1 ? name : name.slice(0, dot);
  const kind = VIDEO_EXT.has(ext) ? 'video' : 'image';

  const match = STAMP.exec(base) ?? CLEANSHOT.exec(base);
  if (!match) {
    return { name, ext, kind, prefix: null, hash: null, ts: null, dayKey: 'undated' };
  }

  const [y, mo, d, h, mi, s] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const ts = new Date(y, mo - 1, d, h, mi, s).getTime();

  const before = base.slice(0, match.index).replace(/[-\s]+$/, '');
  const after = base.slice(match.index + match[0].length);
  const hash = /^-[0-9a-f]{7,8}$/.test(after) ? after.slice(1) : null;

  return {
    name,
    ext,
    kind,
    prefix: before || null,
    hash,
    ts,
    dayKey: match[0].slice(0, 10).replaceAll('-', '.'),
  };
}

/** Chronological order; undated strays close the stream. */
function byTime(a: Parsed, b: Parsed): number {
  if (a.ts === null && b.ts === null) return a.name.localeCompare(b.name);
  if (a.ts === null) return 1;
  if (b.ts === null) return -1;
  return a.ts - b.ts || a.name.localeCompare(b.name);
}

export function buildTimeline(names: string[]): Timeline {
  const parsed = names.map(parseName);
  parsed.sort(byTime);

  const items: Item[] = parsed.map((p, index) => ({ ...p, index }));

  const days: Day[] = [];
  const dayOf: number[] = [];
  for (const item of items) {
    let day = days[days.length - 1];
    if (!day || day.key !== item.dayKey) {
      day = {
        key: item.dayKey,
        label:
          item.ts === null ? 'undated' : `${item.dayKey} · ${WEEKDAYS[new Date(item.ts).getDay()]}`,
        items: [],
        number: days.length + 1,
      };
      days.push(day);
    }
    day.items.push(item);
    dayOf.push(days.length - 1);
  }

  return { items, days, dayOf };
}

export const UNLABELLED = 'unlabelled';

/**
 * The series a file is grouped under, or null when unlabelled. Entries written before series
 * labels have no `series` field, so fall back to the series of their `sketch`.
 */
export function seriesKeyOf(entry: Pick<FileAttribution, 'series' | 'sketch'>): string | null {
  // `||`, not `??`: an empty-string series falls back too.
  return entry.series || (entry.sketch ? seriesOf(entry.sketch) : null);
}

/**
 * `?pilot=<t>` on the Light Table URL: view the stored pilot labelled at threshold `t`.
 * Null when absent or not a number in [0, 1].
 */
export function pilotParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('pilot');
  if (raw === null || raw.trim() === '') return null;
  const t = Number(raw);
  return Number.isFinite(t) && t >= 0 && t <= 1 ? t : null;
}

/**
 * The stored pilot answers (`pilot-results.json`, kept raw) labelled by the shared accept rule
 * at one threshold, client-side. Older entries without `candidatePaths` still get their series;
 * they just have no path.
 */
export function pilotAttributions(data: AttributionFile, t: number): AttributionFile {
  const thresholds = { default: t };
  const files: AttributionFile['files'] = Object.create(null);
  for (const [name, entry] of Object.entries(data.files)) {
    files[name] = applyAccept(entry, parseName(name).ts, thresholds, entry.candidatePaths ?? {});
  }
  return { ...data, thresholds, files };
}

export type LedgerSort = 'recent' | 'count';

/**
 * Regroup the same stream by label: each `Day` is one group (`key` is the series, as
 * `seriesKeyOf` gives it, or `UNLABELLED`), so day navigation, the contact sheet and the loupe
 * work unchanged.
 * Callers pass already-filtered names (keepers-only mode passes just the kept ones).
 */
export function buildSketchTimeline(
  names: string[],
  sketchOf: (name: string) => string | null,
  sort: LedgerSort,
): Timeline {
  const groups = new Map<string, Parsed[]>();
  for (const name of names) {
    const key = sketchOf(name) ?? UNLABELLED;
    const list = groups.get(key) ?? [];
    list.push(parseName(name));
    groups.set(key, list);
  }

  const labelOf = (key: string) =>
    key === UNLABELLED ? UNLABELLED : key.replace(/^sketches\//, '');
  const newest = (list: Parsed[]) =>
    list.reduce<number | null>((m, p) => (p.ts === null ? m : Math.max(m ?? p.ts, p.ts)), null);

  const entries = [...groups.entries()].map(([key, list]) => ({
    key,
    label: labelOf(key),
    list: list.sort(byTime),
    newest: newest(list),
  }));
  const recent = (a: (typeof entries)[number], b: (typeof entries)[number]) => {
    if (a.newest === null && b.newest === null) return a.label.localeCompare(b.label);
    if (a.newest === null) return 1;
    if (b.newest === null) return -1;
    return b.newest - a.newest || a.label.localeCompare(b.label);
  };
  entries.sort((a, b) => {
    if ((a.key === UNLABELLED) !== (b.key === UNLABELLED)) return a.key === UNLABELLED ? 1 : -1;
    if (sort === 'count' && a.list.length !== b.list.length) return b.list.length - a.list.length;
    return recent(a, b);
  });

  const items: Item[] = [];
  const days: Day[] = [];
  const dayOf: number[] = [];
  for (const e of entries) {
    const day: Day = { key: e.key, label: e.label, items: [], number: days.length + 1 };
    for (const p of e.list) {
      const item: Item = { ...p, index: items.length };
      items.push(item);
      day.items.push(item);
      dayOf.push(days.length);
    }
    days.push(day);
  }
  return { items, days, dayOf };
}

export type LedgerRow = {
  key: string;
  label: string;
  path: string | null;
  deleted: boolean;
  count: number;
  first: number | null;
  last: number | null;
  /** newest keeper in the group, else its newest item */
  image: Item;
};

/**
 * One row per series group. A folder series shows its folder (`src/sketches/<series>/`); a
 * one-off shows its file. A row reads as deleted only when every labelled file in it is.
 */
export function buildLedger(
  timeline: Timeline,
  keepers: Set<string>,
  files: AttributionFile['files'],
): LedgerRow[] {
  return timeline.days.map((day) => {
    const stamps = day.items.flatMap((i) => (i.ts === null ? [] : [i.ts]));
    const image = [...day.items].reverse().find((i) => keepers.has(i.name)) ?? day.items.at(-1);
    const labelled =
      day.key === UNLABELLED
        ? []
        : day.items.flatMap((i) => {
            const entry = files[i.name];
            return entry && seriesKeyOf(entry) !== null ? [entry] : [];
          });
    const folder = labelled.some((e) => e.sketch?.startsWith(`${day.key}/`));
    // Series keys always start with `sketches/`, so this is the folder under src/.
    const path = folder ? `src/${day.key}/` : (labelled.find((e) => e.path !== null)?.path ?? null);
    return {
      key: day.key,
      label: day.label,
      path,
      deleted: labelled.length > 0 && labelled.every((e) => e.deleted === true),
      count: day.items.length,
      first: stamps.length ? Math.min(...stamps) : null,
      last: stamps.length ? Math.max(...stamps) : null,
      image: image as Item,
    };
  });
}

/** Time-of-day label for the header, from the filename stamp. */
export function timeLabel(item: Item): string | null {
  if (item.ts === null) return null;
  const d = new Date(item.ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
