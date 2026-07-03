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

type Parsed = Omit<Item, 'index'>;

function parseName(name: string): Parsed {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  const base = dot === -1 ? name : name.slice(0, dot);
  const kind = VIDEO_EXT.has(ext) ? 'video' : 'image';

  const match = STAMP.exec(base) ?? CLEANSHOT.exec(base);
  if (!match) {
    return { name, ext, kind, prefix: null, hash: null, ts: null, dayKey: 'undated' };
  }

  const [y, mo, d, h, mi, s] = match.slice(1).map(Number) as [
    number, number, number, number, number, number,
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

export function buildTimeline(names: string[]): Timeline {
  const parsed = names.map(parseName);
  parsed.sort((a, b) => {
    if (a.ts === null && b.ts === null) return a.name.localeCompare(b.name);
    if (a.ts === null) return 1; // undated strays close the stream
    if (b.ts === null) return -1;
    return a.ts - b.ts || a.name.localeCompare(b.name);
  });

  const items: Item[] = parsed.map((p, index) => ({ ...p, index }));

  const days: Day[] = [];
  const dayOf: number[] = [];
  for (const item of items) {
    let day = days[days.length - 1];
    if (!day || day.key !== item.dayKey) {
      day = {
        key: item.dayKey,
        label:
          item.ts === null
            ? 'undated'
            : `${item.dayKey} · ${WEEKDAYS[new Date(item.ts).getDay()]}`,
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

/** Time-of-day label for the header, from the filename stamp. */
export function timeLabel(item: Item): string | null {
  if (item.ts === null) return null;
  const d = new Date(item.ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
