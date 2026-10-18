/**
 * The Light Table — keyboard-first review of everything in output/.
 *
 * One stream, strictly chronological. Two modes: the loupe (one export,
 * full size) and the contact sheet (`g` — the current day as a minimap).
 * `s` stars keepers; `S` filters the stream to them. The URL hash tracks
 * the focused file so a refresh resumes in place.
 *
 * `v` regroups the same stream by series (labels from `/api/sketches`): the
 * Ledger lists one row per series, and each series then stands in for a day,
 * so `[`/`]`, the sheet and the loupe work unchanged inside it.
 *
 * `/?pilot=<t>` shows the stored pilot answers instead, labelled client-side at threshold `t`
 * (marked `pilot · ≥ t` in the header); sketches.json is never read.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AttributionFile, FileAttribution } from './attribution.ts';
import {
  buildLedger,
  buildSketchTimeline,
  buildTimeline,
  parseName,
  pilotAttributions,
  pilotParam,
  seriesKeyOf,
  UNLABELLED,
  type Day,
  type Item,
  type LedgerRow,
  type LedgerSort,
  type Timeline,
} from './model.ts';

const fileUrl = (name: string) => `/output/${encodeURIComponent(name)}`;
const thumbUrl = (name: string) => `/thumbs/${encodeURIComponent(name)}`;

const PRELOAD_OFFSETS = [1, -1, 2, -2, 3, -3];
const PRELOAD_CACHE_MAX = 16;

type Progress = { done: number; total: number };

/** `null` while loading; `'missing'` when there is no usable sketches.json. */
type Attributions = AttributionFile | null | 'missing';

/** `?pilot=<t>`: the threshold the stored pilot is viewed at, or null for the real labels. */
const PILOT_THRESHOLD = pilotParam(window.location.search);

const isStringOrNull = (v: unknown) => v === null || typeof v === 'string';

/**
 * A readable entry: an object whose `sketch` is a string or null, and whose `path` and `series`
 * are each a string, null or absent (entries written before series labels have no `series`).
 */
function isUsableEntry(entry: unknown): entry is FileAttribution {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
  const { sketch, path, series } = entry as { sketch?: unknown; path?: unknown; series?: unknown };
  const optional = (v: unknown) => v === undefined || isStringOrNull(v);
  return isStringOrNull(sketch) && optional(path) && optional(series);
}

/**
 * Defensive read of `/api/sketches`. The server only rejects unparseable JSON, so the shape is
 * checked here: no object `files` counts as missing, and unusable entries are dropped (those
 * files then read as unlabelled).
 */
function asAttributions(body: unknown): AttributionFile | 'missing' {
  if (typeof body !== 'object' || body === null) return 'missing';
  const raw = (body as { files?: unknown }).files;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'missing';
  // No prototype, so a filename like `constructor` never resolves to an inherited member.
  const files: AttributionFile['files'] = Object.create(null);
  for (const [name, entry] of Object.entries(raw)) {
    if (isUsableEntry(entry)) files[name] = entry;
  }
  return { ...(body as AttributionFile), files };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const stampDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
};
const formatCount = (n: number) => n.toLocaleString('en-US');

const SORT_LABEL: Record<LedgerSort, string> = { recent: 'most recent', count: 'count' };

/** [keys, action] rows for the `?` overlay. */
const SHORTCUTS: [string[], string][] = [
  [['→', 'j'], 'next export'],
  [['←', 'k'], 'previous export'],
  [[']', '⇧→'], 'next day'],
  [['[', '⇧←'], 'previous day'],
  [['↓', '↑'], 'next / previous day · rows in the sheet'],
  [['Home', 'End'], 'first / last of the day'],
  [['g'], 'toggle contact sheet'],
  [['↵'], 'open selection in loupe'],
  [['esc'], 'close sheet · back to ledger in series mode'],
  [['space'], 'play / pause video'],
  [['s'], 'star as keeper'],
  [['S'], 'keepers only'],
  [['v'], 'group by day / by series'],
  [['n'], 'sort ledger: recent / count'],
  [['c'], 'copy file path'],
  [['o'], 'reveal in Finder'],
  [['?'], 'shortcuts'],
];

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Filename rendered in its voices: prefix and hash in Pencil, stamp in Ink. */
function FileName({ item }: { item: Item }) {
  const dot = item.name.lastIndexOf('.');
  const base = dot === -1 ? item.name : item.name.slice(0, dot);
  const ext = dot === -1 ? '' : item.name.slice(dot);
  let rest = item.prefix ? base.slice(item.prefix.length).replace(/^[-\s]+/, '') : base;
  if (item.hash) rest = rest.slice(0, -(item.hash.length + 1));
  return (
    <span className="fname" title={item.name}>
      {item.prefix && <span className="quiet">{item.prefix} · </span>}
      {rest}
      {item.hash && <span className="quiet">-{item.hash}</span>}
      {ext}
    </span>
  );
}

function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="help" onClose={onClose} aria-label="Keyboard shortcuts">
      <table>
        <tbody>
          {SHORTCUTS.map(([keys, action]) => (
            <tr key={action}>
              <th scope="row">
                {keys.map((k, i) => (
                  <kbd key={k} className={i > 0 ? 'kbd-alt' : undefined}>
                    {k}
                  </kbd>
                ))}
              </th>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  );
}

function Loupe({
  item,
  broken,
  onBroken,
  videoRef,
  onStep,
}: {
  item: Item;
  broken: boolean;
  onBroken: (name: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="loupe">
      {broken ? (
        <div className="loupe-broken">
          <span>{item.name}</span>
          <span className="quiet">file could not be loaded</span>
        </div>
      ) : item.kind === 'video' ? (
        <video
          key={item.name}
          ref={videoRef}
          src={fileUrl(item.name)}
          muted
          autoPlay
          loop
          playsInline
          onError={() => onBroken(item.name)}
        />
      ) : (
        /* No key: reusing one <img> keeps the previous export painted while
           the next decodes, so fast stepping never flashes blank. */
        <img
          src={fileUrl(item.name)}
          alt={item.name}
          onError={(e) => {
            // A stale error from an already-replaced src must not mark the
            // export we've since moved on to.
            if (e.currentTarget.src.endsWith(encodeURIComponent(item.name))) onBroken(item.name);
          }}
        />
      )}
      <button
        type="button"
        className="step-zone step-prev"
        aria-label="Previous export"
        tabIndex={-1}
        onClick={() => onStep(-1)}
      />
      <button
        type="button"
        className="step-zone step-next"
        aria-label="Next export"
        tabIndex={-1}
        onClick={() => onStep(1)}
      />
    </div>
  );
}

function SheetCell({
  item,
  selected,
  kept,
  onSelect,
  onOpen,
}: {
  item: Item;
  selected: boolean;
  kept: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      className={`cell${selected ? ' is-selected' : ''}`}
      aria-label={item.name}
      aria-current={selected || undefined}
      tabIndex={-1}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <img
        src={`${thumbUrl(item.name)}${attempt > 0 ? `?retry=${attempt}` : ''}`}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          // The cache may still be building; try again shortly, twice.
          if (attempt < 2) setTimeout(() => setAttempt(attempt + 1), 5000);
        }}
      />
      {item.kind === 'video' && <span className="play-mark" aria-hidden="true" />}
      {kept && <span className="kept-dot" aria-hidden="true" />}
    </button>
  );
}

function Sheet({
  day,
  currentName,
  keepers,
  gridRef,
  onSelect,
  onOpen,
}: {
  day: Day;
  currentName: string;
  keepers: Set<string>;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (name: string) => void;
  onOpen: (name: string) => void;
}) {
  return (
    <div className="sheet">
      <div
        className="sheet-grid"
        ref={gridRef}
        role="listbox"
        aria-label={`Contact sheet · ${day.label}`}
      >
        {day.items.map((item) => (
          <SheetCell
            key={item.name}
            item={item}
            selected={item.name === currentName}
            kept={keepers.has(item.name)}
            onSelect={() => onSelect(item.name)}
            onOpen={() => onOpen(item.name)}
          />
        ))}
      </div>
    </div>
  );
}

function LedgerEntry({
  row,
  selected,
  onOpen,
}: {
  row: LedgerRow;
  selected: boolean;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const sub = [row.path, row.deleted ? 'deleted' : null].filter(Boolean).join(' · ');
  return (
    <button
      ref={ref}
      type="button"
      className={`ledger-row${selected ? ' is-selected' : ''}${row.key === UNLABELLED ? ' is-unlabelled' : ''}`}
      aria-current={selected || undefined}
      tabIndex={-1}
      onClick={onOpen}
    >
      <img
        src={`${thumbUrl(row.image.name)}${attempt > 0 ? `?retry=${attempt}` : ''}`}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          // The cache may still be building; try again shortly, twice.
          if (attempt < 2) setTimeout(() => setAttempt(attempt + 1), 5000);
        }}
      />
      <span className="ledger-name">
        <span className="ledger-label">{row.label}</span>
        {sub && <span className="ledger-path">{sub}</span>}
      </span>
      <span className="ledger-count">{formatCount(row.count)}</span>
      <span className="ledger-dates">
        {row.first !== null && row.last !== null
          ? `${stampDate(row.first)} → ${stampDate(row.last)}`
          : ''}
      </span>
    </button>
  );
}

/** One row per series group; the selected row is the focused file's group. */
function Ledger({
  rows,
  sort,
  selectedKey,
  onOpen,
}: {
  rows: LedgerRow[];
  sort: LedgerSort;
  selectedKey: string | null;
  onOpen: (key: string) => void;
}) {
  return (
    <div className="ledger">
      <div
        className="ledger-list"
        role="listbox"
        aria-label={`Series · sorted by ${SORT_LABEL[sort]}`}
      >
        {rows.map((row) => (
          <LedgerEntry
            key={row.key}
            row={row}
            selected={row.key === selectedKey}
            onOpen={() => onOpen(row.key)}
          />
        ))}
      </div>
    </div>
  );
}

function LightTable() {
  const [names, setNames] = useState<string[] | null>(null);
  const [root, setRoot] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keepers, setKeepers] = useState<Set<string>>(new Set());
  const [keepersOnly, setKeepersOnly] = useState(false);
  const [cursorName, setCursorName] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'day' | 'sketch'>('day');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [sort, setSort] = useState<LedgerSort>('recent');
  const [attributions, setAttributions] = useState<Attributions>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const sheetAnchor = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preloads = useRef(new Map<string, HTMLImageElement>());

  // ---------- data ----------

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/index').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
      fetch('/api/keepers').then((r) => (r.ok ? r.json() : [])),
      // 404 (no file yet) and 503 (malformed) both read as missing; never fatal.
      fetch(PILOT_THRESHOLD === null ? '/api/sketches' : '/api/sketches?source=pilot')
        .then((r) => (r.ok ? r.json() : 'missing'))
        .then(asAttributions)
        .then((a) =>
          a === 'missing' || PILOT_THRESHOLD === null ? a : pilotAttributions(a, PILOT_THRESHOLD),
        )
        .catch(() => 'missing' as const),
    ])
      .then(
        ([index, kept, sketches]: [
          { root: string; files: string[] },
          string[],
          AttributionFile | 'missing',
        ]) => {
          if (cancelled) return;
          setRoot(index.root);
          setNames(index.files);
          setKeepers(new Set(kept));
          setAttributions(sketches);
        },
      )
      .catch((err) => !cancelled && setLoadError(String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const full = useMemo(() => (names ? buildTimeline(names) : null), [names]);
  const keptNames = useMemo(
    () => (full ? full.items.filter((i) => keepers.has(i.name)).map((i) => i.name) : null),
    [full, keepers],
  );
  const kept = useMemo(() => (keptNames ? buildTimeline(keptNames) : null), [keptNames]);

  // By-series mode: the same names regrouped, one `Day` per series.
  const files = attributions && attributions !== 'missing' ? attributions.files : null;
  const sketchView = mode === 'sketch' && files !== null;
  const sketchMissing = mode === 'sketch' && files === null;
  const sketchOf = useMemo(
    () =>
      files
        ? (name: string) => {
            const entry = files[name];
            return entry ? seriesKeyOf(entry) : null;
          }
        : null,
    [files],
  );
  const sketchNames = keepersOnly ? keptNames : names;
  // Only regroup while in sketch mode: day mode shouldn't pay for it on every star.
  const sketchTimeline = useMemo(
    () =>
      mode === 'sketch' && sketchOf && sketchNames
        ? buildSketchTimeline(sketchNames, sketchOf, sort)
        : null,
    [mode, sketchOf, sketchNames, sort],
  );

  const dayTimeline: Timeline | null = keepersOnly ? kept : full;
  const active: Timeline | null = sketchView ? sketchTimeline : dayTimeline;
  const ledgerRows = useMemo(
    () =>
      sketchView && sketchTimeline && files ? buildLedger(sketchTimeline, keepers, files) : [],
    [sketchView, sketchTimeline, keepers, files],
  );
  const showLedger = sketchView && ledgerOpen;

  const byName = useMemo(
    () => new Map((active?.items ?? []).map((i) => [i.name, i.index])),
    [active],
  );

  // Initial position: the URL hash if it names a real file, else the first
  // export of the most recent dated day.
  useEffect(() => {
    if (!full || cursorName !== null || full.items.length === 0) return;
    const fromHash = decodeURIComponent(window.location.hash.slice(1));
    if (fromHash && full.items.some((i) => i.name === fromHash)) {
      setCursorName(fromHash);
      return;
    }
    const latestDated = [...full.days].reverse().find((d) => d.key !== 'undated') ?? full.days[0];
    setCursorName(latestDated!.items[0]!.name);
  }, [full, cursorName]);

  const activeIndex = cursorName != null ? byName.get(cursorName) : undefined;
  const current = activeIndex !== undefined ? active!.items[activeIndex] : undefined;
  const day: Day | undefined =
    current && active ? active.days[active.dayOf[current.index]!] : undefined;

  // ---------- effects ----------

  useEffect(() => {
    if (cursorName) history.replaceState(null, '', `#${encodeURIComponent(cursorName)}`);
  }, [cursorName]);

  useEffect(() => {
    const onHash = () => {
      const name = decodeURIComponent(window.location.hash.slice(1));
      if (name && full?.items.some((i) => i.name === name)) setCursorName(name);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [full]);

  // Pre-decode the neighbors so stepping is an instant swap, never a blank.
  useEffect(() => {
    if (!active || !current) return;
    for (const offset of PRELOAD_OFFSETS) {
      const item = active.items[current.index + offset];
      if (!item || item.kind !== 'image' || preloads.current.has(item.name)) continue;
      const img = new Image();
      img.src = fileUrl(item.name);
      img.decode().catch(() => {});
      preloads.current.set(item.name, img);
    }
    while (preloads.current.size > PRELOAD_CACHE_MAX) {
      const oldest = preloads.current.keys().next().value!;
      preloads.current.delete(oldest);
    }
  }, [active, current]);

  // Thumbnail-cache progress, polled while the prewarm runs.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const p: Progress = await (await fetch('/api/progress')).json();
        if (cancelled) return;
        setProgress(p);
        if (p.total > 0 && p.done >= p.total && timer) clearInterval(timer);
      } catch {
        /* server restarting; keep polling */
      }
    };
    void poll();
    timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // ---------- actions ----------

  const showFlash = (message: string) => {
    setFlash(message);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1500);
  };

  const step = (delta: number) => {
    if (!active || activeIndex === undefined) return;
    const next = Math.min(Math.max(activeIndex + delta, 0), active.items.length - 1);
    setCursorName(active.items[next]!.name);
  };

  const stepDay = (dir: 1 | -1) => {
    if (!active || !current) return;
    const d = active.dayOf[current.index]!;
    const target = active.days[Math.min(Math.max(d + dir, 0), active.days.length - 1)];
    setCursorName(target!.items[0]!.name);
  };

  const stepHomeEnd = (end: boolean) => {
    if (!day) return;
    setCursorName(day.items[end ? day.items.length - 1 : 0]!.name);
  };

  const sheetColumns = () => {
    const grid = gridRef.current;
    if (!grid) return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  };

  const toggleSheet = (open: boolean) => {
    if (open) sheetAnchor.current = cursorName;
    setSheetOpen(open);
  };

  const toggleMode = () => {
    if (mode === 'day') {
      setMode('sketch');
      setLedgerOpen(true);
      setSheetOpen(false);
      // R9: most exports are unlabelled, so entering from one would open the ledger on its last
      // row. Start on the first series instead, whenever a labelled group exists (Unlabelled
      // always sorts last, so the first group is labelled if any is).
      if (current && sketchOf && sketchNames && sketchOf(current.name) === null) {
        const first = buildSketchTimeline(sketchNames, sketchOf, sort).days[0];
        if (first && first.key !== UNLABELLED && first.items[0]) setCursorName(first.items[0].name);
      }
    } else {
      setMode('day');
      setLedgerOpen(false);
    }
  };

  /** Open one series group in the contact sheet, cursor on its first export. */
  const openGroup = (key: string) => {
    const group = active?.days.find((d) => d.key === key);
    const first = group?.items[0];
    if (!first) return;
    setCursorName(first.name);
    sheetAnchor.current = first.name;
    setSheetOpen(true);
    setLedgerOpen(false);
  };

  const toggleKeeper = (name: string) => {
    const nowKept = !keepers.has(name);
    const next = new Set(keepers);
    if (nowKept) next.add(name);
    else next.delete(name);
    setKeepers(next);
    fetch('/api/keepers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kept: nowKept }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
      })
      .catch(() => {
        setKeepers(keepers);
        showFlash('star not saved');
      });
    // Un-starring the focused export while in keepers-only mode removes it
    // from the stream — move to the nearest keeper so the loupe never blanks.
    if (!nowKept && keepersOnly && cursorName === name && full) {
      const keptItems = full.items.filter((i) => next.has(i.name));
      const fullIndex = full.items.findIndex((i) => i.name === name);
      const after = keptItems.find((i) => i.index > fullIndex);
      const before = [...keptItems].reverse().find((i) => i.index < fullIndex);
      setCursorName((after ?? before)?.name ?? null);
    }
  };

  const toggleKeepersOnly = () => {
    if (!keepersOnly) {
      if (current && !keepers.has(current.name) && keepers.size > 0 && full) {
        // Snap to the nearest keeper, searching outward from here. By name, not
        // `current.index`: in sketch mode that indexes the regrouped stream.
        const idx = full.items.findIndex((i) => i.name === current.name);
        for (let d = 1; d < full.items.length; d++) {
          const fwd = full.items[idx + d];
          const back = full.items[idx - d];
          if (fwd && keepers.has(fwd.name)) return (setKeepersOnly(true), setCursorName(fwd.name));
          if (back && keepers.has(back.name))
            return (setKeepersOnly(true), setCursorName(back.name));
        }
      }
      setKeepersOnly(true);
    } else {
      setKeepersOnly(false);
    }
  };

  const copyPath = () => {
    if (!current) return;
    navigator.clipboard
      .writeText(`${root}/${current.name}`)
      .then(() => showFlash('path copied'))
      .catch(() => showFlash('copy failed'));
  };

  const reveal = () => {
    if (!current) return;
    fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: current.name }),
    }).then((r) => {
      if (!r.ok) showFlash('reveal failed');
    });
  };

  // ---------- keyboard ----------

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (helpOpen) {
      // The native dialog closes itself on Escape; `?` toggles too.
      if (e.key === '?') setHelpOpen(false);
      return;
    }
    const handled = () => e.preventDefault();
    if (e.key === 'v') {
      handled();
      toggleMode();
      return;
    }
    if (sketchMissing) {
      if (e.key === '?') {
        handled();
        setHelpOpen(true);
      } else if (e.key === 'S') {
        // The keepers-empty note (shown over this one) promises `S` returns to everything.
        handled();
        toggleKeepersOnly();
      }
      return;
    }
    if (showLedger) {
      // The ledger's selection is the focused file's group, so moving a row
      // is moving to the first export of the neighbouring series.
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          handled();
          stepDay(1);
          break;
        case 'ArrowUp':
        case 'k':
          handled();
          stepDay(-1);
          break;
        case 'Home':
        case 'End': {
          handled();
          const target = e.key === 'Home' ? active?.days[0] : active?.days.at(-1);
          if (target?.items[0]) setCursorName(target.items[0].name);
          break;
        }
        case 'Enter':
          handled();
          if (day) openGroup(day.key);
          break;
        case 'n':
          handled();
          setSort(sort === 'recent' ? 'count' : 'recent');
          break;
        case 'S':
          handled();
          toggleKeepersOnly();
          break;
        case '?':
          handled();
          setHelpOpen(true);
          break;
      }
      return;
    }
    switch (e.key) {
      case 'ArrowRight':
        handled();
        e.shiftKey ? stepDay(1) : step(1);
        break;
      case 'ArrowLeft':
        handled();
        e.shiftKey ? stepDay(-1) : step(-1);
        break;
      case 'j':
        handled();
        step(1);
        break;
      case 'k':
        handled();
        step(-1);
        break;
      case ']':
        handled();
        stepDay(1);
        break;
      case '[':
        handled();
        stepDay(-1);
        break;
      case 'ArrowDown':
        handled();
        sheetOpen ? step(sheetColumns()) : stepDay(1);
        break;
      case 'ArrowUp':
        handled();
        sheetOpen ? step(-sheetColumns()) : stepDay(-1);
        break;
      case 'Home':
        handled();
        stepHomeEnd(false);
        break;
      case 'End':
        handled();
        stepHomeEnd(true);
        break;
      case 'g':
        handled();
        toggleSheet(!sheetOpen);
        break;
      case 'Enter':
        if (sheetOpen) {
          handled();
          setSheetOpen(false);
        }
        break;
      case 'Escape':
        if (sketchView) {
          // From the sheet or the loupe, back to the ledger on this group.
          handled();
          setSheetOpen(false);
          setLedgerOpen(true);
        } else if (sheetOpen) {
          handled();
          if (sheetAnchor.current) setCursorName(sheetAnchor.current);
          setSheetOpen(false);
        }
        break;
      case ' ':
        handled();
        if (videoRef.current) {
          videoRef.current.paused ? void videoRef.current.play() : videoRef.current.pause();
        }
        break;
      case 's':
        handled();
        if (current) toggleKeeper(current.name);
        break;
      case 'S':
        handled();
        toggleKeepersOnly();
        break;
      case 'c':
        handled();
        copyPath();
        break;
      case 'o':
        handled();
        reveal();
        break;
      case '?':
        handled();
        setHelpOpen(true);
        break;
    }
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // ---------- render ----------

  if (loadError) {
    return (
      <p className="empty">
        Couldn’t read <code>output/</code> — is the review server running? ({loadError})
      </p>
    );
  }
  if (!full) return <p className="empty">Reading output/ …</p>;
  if (full.items.length === 0) {
    return (
      <p className="empty">
        Nothing in <code>output/</code> yet — exports land here when you save from a sketch.
      </p>
    );
  }

  const keepersEmpty = keepersOnly && (!kept || kept.items.length === 0);
  const idxInDay = current && day ? day.items.findIndex((i) => i.name === current.name) : 0;
  const thumbsBuilding = progress && progress.total > 0 && progress.done < progress.total;
  // Ledger and the missing-labels note replace the per-file chrome.
  const listView = showLedger || sketchMissing;
  const seriesCount = ledgerRows.filter((r) => r.key !== UNLABELLED).length;
  const unlabelledCount = ledgerRows.find((r) => r.key === UNLABELLED)?.count ?? 0;

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-day" aria-label={sketchView ? 'Series' : 'Day'}>
          {listView ? (
            'by series'
          ) : day && !keepersEmpty ? (
            <>
              {day.label}
              <span className="quiet">
                {' '}
                · {idxInDay + 1}/{day.items.length}
              </span>
            </>
          ) : (
            'keepers'
          )}
        </div>
        <div className="bar-file">
          {showLedger && !keepersEmpty && (
            <span>
              {formatCount(seriesCount)} series
              <span className="quiet"> · sort: {SORT_LABEL[sort]}</span>
            </span>
          )}
          {current && !keepersEmpty && !listView && (
            <>
              <button
                type="button"
                className="star"
                aria-pressed={keepers.has(current.name)}
                aria-label={keepers.has(current.name) ? 'Un-star (s)' : 'Star as keeper (s)'}
                onClick={() => toggleKeeper(current.name)}
              >
                <StarIcon filled={keepers.has(current.name)} />
              </button>
              <FileName item={current} />
              {current.ext !== 'png' && <span className="badge">{current.ext}</span>}
            </>
          )}
          <span className="flash" role="status">
            {flash}
          </span>
        </div>
        <div className="bar-meta">
          {thumbsBuilding && (
            <span className="quiet">
              building thumbnails · {progress.done}/{progress.total}
            </span>
          )}
          {showLedger && !keepersEmpty && <span>{formatCount(unlabelledCount)} unlabelled</span>}
          {active && day && !keepersEmpty && !listView && (
            <span>
              {sketchView ? 'series' : 'day'} {day.number}/{active.days.length}
            </span>
          )}
          {keepersOnly && <span>keepers · {kept?.items.length ?? 0}</span>}
          {PILOT_THRESHOLD !== null && (
            <span className="quiet" title="Pilot answers, not the real labels">
              pilot · ≥ {PILOT_THRESHOLD}
            </span>
          )}
          <button
            type="button"
            className="help-button"
            aria-label="Keyboard shortcuts (?)"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>
      </header>

      <div
        className="scrubber"
        aria-hidden="true"
        onClick={(e) => {
          if (!day || listView) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          const target = Math.min(
            day.items.length - 1,
            Math.max(0, Math.floor(frac * day.items.length)),
          );
          setCursorName(day.items[target]!.name);
        }}
      >
        {day && day.items.length > 0 && !listView && (
          <span
            className="scrubber-mark"
            style={{ left: `${((idxInDay + 0.5) / day.items.length) * 100}%` }}
          />
        )}
      </div>

      <main className="stage">
        {keepersEmpty ? (
          <p className="empty">
            No keepers yet — press <code>s</code> on anything worth keeping. <code>S</code> returns
            to everything.
          </p>
        ) : sketchMissing ? (
          <p className="empty">
            {PILOT_THRESHOLD === null ? (
              <>
                No sketch labels yet — run <code>npm run tag:output</code>.
              </>
            ) : (
              <>
                No pilot yet — run <code>npm run tag:output -- --pilot 300</code>.
              </>
            )}{' '}
            <code>v</code> returns to days.
          </p>
        ) : showLedger ? (
          <Ledger rows={ledgerRows} sort={sort} selectedKey={day?.key ?? null} onOpen={openGroup} />
        ) : sheetOpen && day && current ? (
          <Sheet
            day={day}
            currentName={current.name}
            keepers={keepers}
            gridRef={gridRef}
            onSelect={setCursorName}
            onOpen={(name) => {
              setCursorName(name);
              setSheetOpen(false);
            }}
          />
        ) : current ? (
          <Loupe
            item={current}
            broken={broken.has(current.name)}
            onBroken={(name) => setBroken(new Set(broken).add(name))}
            videoRef={videoRef}
            onStep={step}
          />
        ) : null}
      </main>

      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

/* ---------- /pilot: hand-label files so the attribution pilot has known answers ---------- */

type PilotCandidate = { id: string; path: string; ref: string | null };
type PilotFile = { name: string; candidates: PilotCandidate[] };
type PilotState = { files: PilotFile[]; truth: Record<string, string | null> };

const PILOT_NONE_NOTE = 'No pilot yet — run `npm run tag:output -- --pilot 300`.';

/** An image with a placeholder when it will not load. */
function PilotImage({ src, alt, size }: { src: string; alt: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="pilot-missing" style={{ width: size, height: size }}>
      no image
    </span>
  ) : (
    <img src={src} alt={alt} width={size} onError={() => setFailed(true)} />
  );
}

function PilotSheet() {
  const [state, setState] = useState<PilotState | 'missing' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [pilot, truth] = await Promise.all([fetch('/api/pilot'), fetch('/api/pilot-truth')]);
      if (pilot.status === 404) return live && setState('missing');
      if (!pilot.ok || !truth.ok) throw new Error('could not read the pilot files');
      const body = (await pilot.json()) as { files?: PilotFile[] };
      if (live) setState({ files: body.files ?? [], truth: await truth.json() });
    })().catch((err) => live && setError(String(err instanceof Error ? err.message : err)));
    return () => {
      live = false;
    };
  }, []);

  const choose = async (name: string, sketch: string | null) => {
    try {
      const res = await fetch('/api/pilot-truth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, sketch }),
      });
      if (!res.ok) throw new Error('rejected');
    } catch {
      setError(`could not save the label for ${name}`);
      return;
    }
    setError(null);
    setState((cur) =>
      cur && cur !== 'missing' ? { ...cur, truth: { ...cur.truth, [name]: sketch } } : cur,
    );
  };

  if (state === null) return <div className="pilot empty">{error ?? 'Loading…'}</div>;
  if (state === 'missing') return <div className="pilot empty">{PILOT_NONE_NOTE}</div>;

  const { files, truth } = state;
  const done = files.filter((f) => f.name in truth).length;
  return (
    <div className="pilot">
      <header className="pilot-bar">
        <span className="pilot-title">Pilot — which sketch made this?</span>
        <span className="pilot-progress">
          {done}/{files.length} labelled
        </span>
        {error ? <span className="pilot-error">{error}</span> : null}
      </header>
      {files.map((file) => {
        const picked = file.name in truth ? truth[file.name] : undefined;
        const item = parseName(file.name);
        return (
          <section key={file.name} className="pilot-file">
            <div className="pilot-output">
              <PilotImage
                src={item.kind === 'video' ? thumbUrl(file.name) : fileUrl(file.name)}
                alt={file.name}
                size={320}
              />
              <span className="fname">{file.name}</span>
            </div>
            <div className="pilot-choices">
              {file.candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pilot-choice${picked === c.id ? ' is-picked' : ''}`}
                  aria-pressed={picked === c.id}
                  onClick={() => choose(file.name, c.id)}
                >
                  {c.ref ? (
                    <PilotImage src={c.ref} alt={c.id} size={160} />
                  ) : (
                    <span className="pilot-missing" style={{ width: 160, height: 160 }}>
                      no reference
                    </span>
                  )}
                  <span className="pilot-path">{c.path}</span>
                </button>
              ))}
              <button
                type="button"
                className={`pilot-none${picked === null ? ' is-picked' : ''}`}
                aria-pressed={picked === null}
                onClick={() => choose(file.name, null)}
              >
                none of these / can't tell
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function App() {
  return window.location.pathname === '/pilot' ? <PilotSheet /> : <LightTable />;
}
