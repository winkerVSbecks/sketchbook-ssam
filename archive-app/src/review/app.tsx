/**
 * The Light Table — keyboard-first review of everything in output/.
 *
 * One stream, strictly chronological. Two modes: the loupe (one export,
 * full size) and the contact sheet (`g` — the current day as a minimap).
 * `s` stars keepers; `S` filters the stream to them. The URL hash tracks
 * the focused file so a refresh resumes in place.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTimeline, type Day, type Item, type Timeline } from './model.ts';

const fileUrl = (name: string) => `/output/${encodeURIComponent(name)}`;
const thumbUrl = (name: string) => `/thumbs/${encodeURIComponent(name)}`;

const PRELOAD_OFFSETS = [1, -1, 2, -2, 3, -3];
const PRELOAD_CACHE_MAX = 16;

type Progress = { done: number; total: number };

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
  [['esc'], 'close sheet without moving'],
  [['space'], 'play / pause video'],
  [['s'], 'star as keeper'],
  [['S'], 'keepers only'],
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
            if (e.currentTarget.src.endsWith(encodeURIComponent(item.name)))
              onBroken(item.name);
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
      <div className="sheet-grid" ref={gridRef} role="listbox" aria-label={`Contact sheet · ${day.label}`}>
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

export function App() {
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
    ])
      .then(([index, kept]: [{ root: string; files: string[] }, string[]]) => {
        if (cancelled) return;
        setRoot(index.root);
        setNames(index.files);
        setKeepers(new Set(kept));
      })
      .catch((err) => !cancelled && setLoadError(String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const full = useMemo(() => (names ? buildTimeline(names) : null), [names]);
  const kept = useMemo(
    () => (full ? buildTimeline(full.items.filter((i) => keepers.has(i.name)).map((i) => i.name)) : null),
    [full, keepers],
  );
  const active: Timeline | null = keepersOnly ? kept : full;

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
        // Snap to the nearest keeper, searching outward from here.
        const idx = current.index;
        for (let d = 1; d < full.items.length; d++) {
          const fwd = full.items[idx + d];
          const back = full.items[idx - d];
          if (fwd && keepers.has(fwd.name)) return setKeepersOnly(true), setCursorName(fwd.name);
          if (back && keepers.has(back.name)) return setKeepersOnly(true), setCursorName(back.name);
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
        if (sheetOpen) {
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

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-day" aria-label="Day">
          {day && !keepersEmpty ? (
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
          {current && !keepersEmpty && (
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
          {active && day && !keepersEmpty && (
            <span>
              day {day.number}/{active.days.length}
            </span>
          )}
          {keepersOnly && <span>keepers · {kept?.items.length ?? 0}</span>}
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
          if (!day) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          const target = Math.min(
            day.items.length - 1,
            Math.max(0, Math.floor(frac * day.items.length)),
          );
          setCursorName(day.items[target]!.name);
        }}
      >
        {day && day.items.length > 0 && (
          <span
            className="scrubber-mark"
            style={{ left: `${((idxInDay + 0.5) / day.items.length) * 100}%` }}
          />
        )}
      </div>

      <main className="stage">
        {keepersEmpty ? (
          <p className="empty">
            No keepers yet — press <code>s</code> on anything worth keeping.
            {' '}
            <code>S</code> returns to everything.
          </p>
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
