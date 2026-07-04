/**
 * The Atlas — an infinite canvas over the whole body of work.
 *
 * Four lenses arrange the same 372 nodes: Clusters (thematic rooms from the
 * corpus analysis), Series (folder groups, chronological), Timeline (month
 * columns × cluster lanes), Spectrum (hue wheel from measured color).
 * Hairline edges surface cross-series affinities; the rail lists clusters,
 * threads (lineages), and opportunity insights. Keyboard-first, like the
 * Light Table: `?` shows shortcuts.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import rawData from '../../atlas.json';
import {
  NODE_W,
  matchesQuery,
  nodeH,
  runCommand,
  thumbUrl,
  type AtlasData,
  type AtlasNode,
  type TagField,
} from './model.ts';
import {
  boundsOfIds,
  computeLayout,
  type Bounds,
  type Layout,
  type LensKey,
} from './layout.ts';

const data = rawData as unknown as AtlasData;
const nodesById = new Map(data.nodes.map((n) => [n.id, n]));
const yearRange = data.nodes.reduce(
  (r, n) => [Math.min(r[0], n.year), Math.max(r[1], n.year)] as [number, number],
  [Infinity, -Infinity] as [number, number],
);

const edgesByNode = (() => {
  const m = new Map<string, { other: string; w: number }[]>();
  for (const [a, b, w] of data.edges) {
    if (!m.has(a)) m.set(a, []);
    if (!m.has(b)) m.set(b, []);
    m.get(a)!.push({ other: b, w });
    m.get(b)!.push({ other: a, w });
  }
  for (const list of m.values()) list.sort((x, y) => y.w - x.w);
  return m;
})();

const LENSES: [LensKey, string][] = [
  ['clusters', 'Clusters'],
  ['series', 'Series'],
  ['timeline', 'Timeline'],
  ['spectrum', 'Spectrum'],
];

const KIND_LABEL: Record<string, string> = {
  'unexplored-combination': 'combine',
  'technique-transfer': 'transfer',
  'abandoned-thread': 'revive',
  'deepen-series': 'deepen',
  bridge: 'bridge',
  'scale-shift': 'scale',
  'series-opportunity': 'series',
  'outlier-worth-revisiting': 'outlier',
};

const SHORTCUTS: [string[], string][] = [
  [['1', '…', '4'], 'lens: clusters · series · timeline · spectrum'],
  [['drag'], 'pan'],
  [['⌥ drag'], 'zoom to an area'],
  [['⌃ scroll'], 'zoom (pinch on a trackpad)'],
  [['+', '−'], 'zoom in / out'],
  [['f'], 'fit everything'],
  [['click'], 'select — show its connections, grey the rest'],
  [['⌘ click'], 'open details'],
  [['/'], 'search'],
  [['c', 't', 'i'], 'rail: clusters · threads · insights'],
  [['esc'], 'clear selection & filters, one step at a time'],
  [['?'], 'shortcuts'],
];

type View = { x: number; y: number; k: number };
type TagFilter = { field: TagField; tag: string };

// ---------- pure helpers ----------

function fitViewFor(b: Bounds, vw: number, vh: number, pad = 90): View {
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const k = Math.max(
    0.03,
    Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh, 1.6),
  );
  return {
    k,
    x: (vw - bw * k) / 2 - b.minX * k,
    y: (vh - bh * k) / 2 - b.minY * k,
  };
}

function center(n: AtlasNode, layout: Layout): { x: number; y: number } | null {
  const p = layout.pos.get(n.id);
  if (!p) return null;
  return { x: p.x + NODE_W / 2, y: p.y + nodeH(n) / 2 };
}

function edgePath(aId: string, bId: string, layout: Layout): string | null {
  const a = nodesById.get(aId);
  const b = nodesById.get(bId);
  if (!a || !b) return null;
  const pa = center(a, layout);
  const pb = center(b, layout);
  if (!pa || !pb) return null;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const d = Math.hypot(dx, dy) || 1;
  const off = Math.min(140, d * 0.14);
  const mx = (pa.x + pb.x) / 2 - (dy / d) * off;
  const my = (pa.y + pb.y) / 2 + (dx / d) * off;
  return `M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`;
}

// ---------- memoized world (labels + nodes) ----------

const World = memo(function World({
  layout,
  sel,
  activeIds,
  onSelect,
  onHover,
}: {
  layout: Layout;
  sel: string | null;
  activeIds: Set<string> | null;
  onSelect: (id: string, detail: boolean) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <>
      {layout.labels.map((l, i) => (
        <div
          key={`${l.text}-${i}`}
          className="group-label"
          style={{ '--lx': `${l.x}px`, '--ly': `${l.y}px` } as React.CSSProperties}
        >
          {l.text}
          {l.sub && <span className="sub">{l.sub}</span>}
        </div>
      ))}
      {data.nodes.map((n) => {
        const p = layout.pos.get(n.id);
        if (!p) return null;
        const dim = activeIds !== null && !activeIds.has(n.id);
        return (
          <button
            key={n.id}
            type="button"
            className={`node${sel === n.id ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
            style={{
              transform: `translate(${p.x}px, ${p.y}px)`,
              width: NODE_W,
              height: nodeH(n),
            }}
            tabIndex={-1}
            aria-label={n.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(n.id, e.metaKey || e.ctrlKey);
            }}
            onPointerEnter={() => onHover(n.id)}
            onPointerLeave={() => onHover(null)}
          >
            <img
              src={thumbUrl(n.url, 256)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </button>
        );
      })}
    </>
  );
});

// ---------- help ----------

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

/** What two connected sketches actually share — shown under each connection. */
function sharedTags(a: AtlasNode, b: AtlasNode): string[] {
  const out: string[] = [];
  if (a.system && a.system === b.system) out.push(a.system);
  for (const field of ['techniques', 'concepts', 'forms', 'influences'] as const) {
    for (const t of a[field]) if (b[field].includes(t)) out.push(t);
  }
  return [...new Set(out)].slice(0, 3);
}

// ---------- details modal (⌘-click) ----------

function DetailsModal({ node, onClose }: { node: AtlasNode | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (node && !d.open) d.showModal();
    else if (!node && d.open) d.close();
    setCopied(null);
  }, [node]);
  const copy = (label: string, text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(label))
      .catch(() => {});
  };
  return (
    <dialog
      ref={ref}
      className="details"
      aria-label={node?.id}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === ref.current) onClose();
      }}
    >
      {node && (
        <>
          <img
            src={thumbUrl(node.url, 1200)}
            alt={node.id}
            style={{ aspectRatio: `${node.w} / ${node.h}` }}
          />
          <div className="details-meta">
            <h2>
              {node.seriesLabel ? `${node.seriesLabel} / ` : ''}
              {node.name}
            </h2>
            <dl>
              <div>
                <dt>file</dt>
                <dd>
                  <button
                    type="button"
                    className="details-copy"
                    title="Copy path"
                    onClick={() => copy('file', `src/${node.id}.ts`)}
                  >
                    <code>src/{node.id}.ts</code>
                    {copied === 'file' && <span className="quiet"> copied</span>}
                  </button>
                </dd>
              </div>
              <div>
                <dt>created</dt>
                <dd>{node.created.replaceAll('-', '.')}</dd>
              </div>
              <div>
                <dt>run</dt>
                <dd>
                  <button
                    type="button"
                    className="details-copy"
                    title="Copy run command"
                    onClick={() => copy('run', runCommand(node.id))}
                  >
                    <code>{runCommand(node.id)}</code>
                    {copied === 'run' && <span className="quiet"> copied</span>}
                  </button>
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}
    </dialog>
  );
}

// ---------- detail panel ----------

function Panel({
  node,
  onTag,
  onJump,
  onClose,
}: {
  node: AtlasNode;
  onTag: (field: TagField, tag: string) => void;
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [node.id]);
  const similar = (edgesByNode.get(node.id) ?? []).slice(0, 5);

  const chips = (field: TagField, tags: string[]) =>
    tags.length > 0 && (
      <div className="chips">
        {tags.map((t) => (
          <button key={t} type="button" className="chip" onClick={() => onTag(field, t)}>
            {t}
          </button>
        ))}
      </div>
    );

  const facts: [string, string | null][] = [
    ['medium', node.medium],
    ['motion', node.motion],
    ['palette', node.palette],
    ['system', node.system],
    ['influence', node.influences.join(', ') || null],
    ['look', node.vision ? `${node.vision.bg} · ${node.vision.density} · ${node.vision.energy}` : null],
  ];

  return (
    <aside className="panel" aria-label={node.id}>
      <button type="button" className="panel-close" aria-label="Close (esc)" onClick={onClose}>
        ×
      </button>
      <a href={node.url} target="_blank" rel="noreferrer">
        <img
          className="hero"
          src={thumbUrl(node.url, 640)}
          alt={node.id}
          style={{ aspectRatio: `${node.w} / ${node.h}` }}
        />
      </a>
      <h2 className="panel-title">{node.name}</h2>
      <p className="panel-sub">
        {node.seriesLabel ? `${node.seriesLabel} · ` : ''}
        {node.date.replace('-', '.')}
      </p>
      {node.description && <p className="panel-desc">{node.description}</p>}
      {chips('concepts', node.concepts)}
      {chips('techniques', node.techniques)}
      {chips('forms', node.forms)}
      <dl className="facts">
        {facts.map(
          ([k, v]) =>
            v && (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ),
        )}
      </dl>
      {node.notable && <p className="panel-notable">{node.notable}</p>}
      <h3 className="panel-h3">connections</h3>
      <p className="panel-note">
        The strongest kin from <em>other</em> series — scored on shared engines, techniques,
        concepts, forms, and measured look. These are the lines on the map; everything
        unconnected is greyed while this sketch is selected.
      </p>
      {similar.length === 0 ? (
        <p className="panel-note">No cross-series connections — this one stands alone.</p>
      ) : (
        <ul className="similar">
          {similar.map(({ other }) => {
            const o = nodesById.get(other);
            if (!o) return null;
            const shared = sharedTags(node, o);
            return (
              <li key={other}>
                <button type="button" onClick={() => onJump(other)}>
                  <img src={thumbUrl(o.url, 96)} alt="" loading="lazy" />
                  <span className="similar-text">
                    <span className="similar-name">
                      {o.seriesLabel ? `${o.seriesLabel} / ` : ''}
                      {o.name}
                    </span>
                    {shared.length > 0 && (
                      <span className="similar-shared">{shared.join(' · ')}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="panel-action"
        onClick={() => {
          navigator.clipboard
            .writeText(runCommand(node.id))
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? 'copied' : 'copy run command'}
      </button>
    </aside>
  );
}

// ---------- app ----------

export function App() {
  const [lens, setLens] = useState<LensKey>('clusters');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<TagFilter | null>(null);
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [insightIdx, setInsightIdx] = useState<number | null>(null);
  const [railTab, setRailTab] = useState<'clusters' | 'threads' | 'insights'>('clusters');
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [modalId, setModalId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.2 });
  const [nodesAnimate, setNodesAnimate] = useState(false);
  const [panning, setPanning] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const animRef = useRef(0);
  const dragRef = useRef<{ sx: number; sy: number; lx: number; ly: number; moved: boolean } | null>(
    null,
  );
  const lastDragMoved = useRef(false);
  const marqueeRef = useRef<{ x0: number; y0: number } | null>(null);

  const layout = useMemo(() => computeLayout(lens, data.nodes, data.clusters), [lens]);

  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // ---------- view control ----------

  const cancelAnim = useCallback(() => cancelAnimationFrame(animRef.current), []);

  const animateTo = useCallback(
    (target: View) => {
      cancelAnim();
      if (reducedMotion) {
        setView(target);
        return;
      }
      const from = viewRef.current;
      const t0 = performance.now();
      const D = 420;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / D);
        const e = 1 - Math.pow(1 - t, 4);
        setView({
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          k: from.k + (target.k - from.k) * e,
        });
        if (t < 1) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [cancelAnim, reducedMotion],
  );

  const stageSize = () => {
    const r = stageRef.current?.getBoundingClientRect();
    return { w: r?.width ?? window.innerWidth, h: r?.height ?? window.innerHeight };
  };

  const fitBounds = useCallback(
    (b: Bounds) => {
      const { w, h } = stageSize();
      animateTo(fitViewFor(b, w, h));
    },
    [animateTo],
  );

  const fitAll = useCallback(() => fitBounds(layout.bounds), [fitBounds, layout]);

  const fitIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      fitBounds(boundsOfIds(ids, nodesById, layout.pos));
    },
    [fitBounds, layout],
  );

  const focusNode = useCallback(
    (id: string) => {
      const n = nodesById.get(id);
      if (!n) return;
      const c = center(n, layout);
      if (!c) return;
      const { w, h } = stageSize();
      const k = Math.max(viewRef.current.k, 0.7);
      animateTo({ k, x: w / 2 - c.x * k, y: h / 2 - c.y * k });
    },
    [animateTo, layout],
  );

  const zoomBy = useCallback(
    (f: number, cx?: number, cy?: number) => {
      cancelAnim();
      const { w, h } = stageSize();
      const px = cx ?? w / 2;
      const py = cy ?? h / 2;
      setView((v) => {
        const k = Math.min(5, Math.max(0.03, v.k * f));
        const scale = k / v.k;
        return { k, x: px - (px - v.x) * scale, y: py - (py - v.y) * scale };
      });
    },
    [cancelAnim],
  );

  // Fit on mount and on every lens change; let nodes animate only after the
  // first layout has painted so they don't fly in from the origin.
  useEffect(() => {
    fitAll();
    const t = setTimeout(() => setNodesAnimate(true), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Track Alt for the marquee-zoom affordance (crosshair cursor).
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Alt' && setAltDown(true);
    const up = (e: KeyboardEvent) => e.key === 'Alt' && setAltDown(false);
    const blur = () => setAltDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Wheel: two-finger scroll pans, pinch / ctrl-scroll zooms at the cursor.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnim();
      const rect = stage.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.0022);
        zoomBy(f, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [cancelAnim, zoomBy]);

  // ---------- filters & focus sets ----------

  const clearFocus = useCallback(() => {
    setQuery('');
    setTagFilter(null);
    setThreadKey(null);
    setInsightIdx(null);
  }, []);

  const activeIds = useMemo<Set<string> | null>(() => {
    if (insightIdx !== null) {
      const ins = data.insights[insightIdx];
      return ins ? new Set(ins.relatedIds) : null;
    }
    if (threadKey) {
      const t = data.threads.find((t) => t.key === threadKey);
      return t ? new Set(t.members) : null;
    }
    if (sel) {
      // Selection focuses its connections: the node plus every neighbor it
      // shares a similarity edge with; the rest of the corpus greys back.
      const set = new Set([sel]);
      for (const { other } of edgesByNode.get(sel) ?? []) set.add(other);
      return set;
    }
    if (tagFilter) {
      return new Set(
        data.nodes.filter((n) => n[tagFilter.field].includes(tagFilter.tag)).map((n) => n.id),
      );
    }
    if (query.trim()) {
      return new Set(data.nodes.filter((n) => matchesQuery(n, query)).map((n) => n.id));
    }
    return null;
  }, [insightIdx, threadKey, sel, tagFilter, query]);

  const setTag = useCallback(
    (field: TagField, tag: string) => {
      clearFocus();
      setTagFilter({ field, tag });
    },
    [clearFocus],
  );

  const jumpTo = useCallback(
    (id: string) => {
      setSel(id);
      focusNode(id);
    },
    [focusNode],
  );

  // ---------- URL hash ----------

  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.slice(1));
    if (fromHash && nodesById.has(fromHash)) setSel(fromHash);
  }, []);
  useEffect(() => {
    history.replaceState(null, '', sel ? `#${encodeURIComponent(sel)}` : '#');
  }, [sel]);

  // ---------- pointer pan ----------

  const stagePoint = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    cancelAnim();
    if (e.altKey) {
      // ⌥-drag: rubber-band a region to zoom into.
      const p = stagePoint(e);
      marqueeRef.current = { x0: p.x, y0: p.y };
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    // No pointer capture yet: capturing on down retargets the eventual click
    // to the stage, so node buttons would never receive it. Capture only once
    // an actual pan begins.
    dragRef.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (marqueeRef.current) {
      const start = marqueeRef.current;
      const p = stagePoint(e);
      setMarquee({ x0: start.x0, y0: start.y0, x1: p.x, y1: p.y });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) {
      d.moved = true;
      setPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.moved) {
      const dx = e.clientX - d.lx;
      const dy = e.clientY - d.ly;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    d.lx = e.clientX;
    d.ly = e.clientY;
  };
  const onPointerUp = () => {
    if (marqueeRef.current && marquee) {
      const w = Math.abs(marquee.x1 - marquee.x0);
      const h = Math.abs(marquee.y1 - marquee.y0);
      if (w > 12 && h > 12) {
        // Screen rect → world bounds, then fit.
        const v = viewRef.current;
        const b: Bounds = {
          minX: (Math.min(marquee.x0, marquee.x1) - v.x) / v.k,
          minY: (Math.min(marquee.y0, marquee.y1) - v.y) / v.k,
          maxX: (Math.max(marquee.x0, marquee.x1) - v.x) / v.k,
          maxY: (Math.max(marquee.y0, marquee.y1) - v.y) / v.k,
        };
        const { w: sw, h: sh } = stageSize();
        animateTo(fitViewFor(b, sw, sh, 48));
      }
      marqueeRef.current = null;
      setMarquee(null);
      // Swallow the click that follows the release.
      lastDragMoved.current = true;
      return;
    }
    lastDragMoved.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setPanning(false);
  };

  const onSelect = useCallback((id: string, detail: boolean) => {
    if (lastDragMoved.current) return;
    if (detail) {
      setModalId(id);
      return;
    }
    setSel((s) => (s === id ? null : id));
  }, []);
  const onHover = useCallback((id: string | null) => setHover(id), []);

  // ---------- keyboard ----------

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inInput = e.target instanceof HTMLInputElement;
    if (inInput) {
      if (e.key === 'Escape') {
        (e.target as HTMLInputElement).blur();
        setQuery('');
      }
      return;
    }
    if (helpOpen) {
      if (e.key === '?') setHelpOpen(false);
      return;
    }
    const handled = () => e.preventDefault();
    switch (e.key) {
      case '1':
      case '2':
      case '3':
      case '4': {
        handled();
        const lensKey = LENSES[Number(e.key) - 1]?.[0];
        if (lensKey) {
          setNodesAnimate(true);
          setLens(lensKey);
        }
        break;
      }
      case 'f':
        handled();
        fitAll();
        break;
      case '/':
        handled();
        searchRef.current?.focus();
        break;
      case '+':
      case '=':
        handled();
        zoomBy(1.4);
        break;
      case '-':
        handled();
        zoomBy(1 / 1.4);
        break;
      case 'c':
        handled();
        setRailTab('clusters');
        break;
      case 't':
        handled();
        setRailTab('threads');
        break;
      case 'i':
        handled();
        setRailTab('insights');
        break;
      case 'Escape':
        handled();
        if (modalId) setModalId(null);
        else if (insightIdx !== null) setInsightIdx(null);
        else if (threadKey) setThreadKey(null);
        else if (sel) setSel(null);
        else if (tagFilter) setTagFilter(null);
        else if (query) setQuery('');
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

  // ---------- edges ----------

  const underlayPaths = useMemo(() => {
    if (lens !== 'clusters' && lens !== 'series') return [];
    return data.edges
      .map(([a, b]) => edgePath(a, b, layout))
      .filter((p): p is string => p !== null);
  }, [lens, layout]);

  const focusEdges = useMemo(() => {
    if (threadKey) return [];
    const focus = hover ?? sel;
    if (!focus) return [];
    return (edgesByNode.get(focus) ?? [])
      .map(({ other }) => edgePath(focus, other, layout))
      .filter((p): p is string => p !== null);
  }, [hover, sel, threadKey, layout]);

  const threadPath = useMemo(() => {
    if (!threadKey) return null;
    const t = data.threads.find((t) => t.key === threadKey);
    if (!t) return null;
    const pts = t.members
      .map((id) => {
        const n = nodesById.get(id);
        return n ? center(n, layout) : null;
      })
      .filter((p): p is { x: number; y: number } => p !== null);
    if (pts.length < 2) return null;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [threadKey, layout]);

  // ---------- rail data ----------

  const selNode = sel ? nodesById.get(sel) : undefined;
  const shownCount = activeIds?.size ?? null;
  const activeInsight = insightIdx !== null ? data.insights[insightIdx] : undefined;

  const clusterIds = useCallback(
    (key: string) => data.nodes.filter((n) => n.cluster === key).map((n) => n.id),
    [],
  );

  // ---------- render ----------

  if (data.nodes.length === 0) {
    return (
      <p className="empty">
        <code>atlas.json</code> is empty — run the corpus analysis, then{' '}
        <code>scripts/atlas/assemble.ts</code>.
      </p>
    );
  }

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-left">
          Atlas
          <span className="quiet">
            {' '}
            · {data.nodes.length} sketches · {yearRange[0]}–{yearRange[1]}
          </span>
        </div>
        <nav className="bar-lenses" aria-label="Lens">
          {LENSES.map(([key, label], i) => (
            <button
              key={key}
              type="button"
              className={`lens-btn${lens === key ? ' is-active' : ''}`}
              onClick={() => setLens(key)}
            >
              {label}
              <span className="lens-kbd">{i + 1}</span>
            </button>
          ))}
        </nav>
        <div className="bar-meta">
          {tagFilter && (
            <button type="button" className="filter-pill" onClick={() => setTagFilter(null)}>
              {tagFilter.tag} ×
            </button>
          )}
          {shownCount !== null && <span className="quiet">{shownCount} shown</span>}
          <input
            ref={searchRef}
            className="search"
            type="search"
            placeholder="search"
            value={query}
            onChange={(e) => {
              setTagFilter(null);
              setThreadKey(null);
              setInsightIdx(null);
              setQuery(e.target.value);
            }}
            aria-label="Search sketches (/)"
          />
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

      <div className="main">
        <aside className="rail">
          <div className="rail-tabs" role="tablist">
            {(['clusters', 'threads', 'insights'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={railTab === tab}
                className={`rail-tab${railTab === tab ? ' is-active' : ''}`}
                onClick={() => setRailTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="rail-body">
            {railTab === 'clusters' &&
              data.clusters.map((c) => (
                <div key={c.key}>
                  <button
                    type="button"
                    className={`row${activeCluster === c.key ? ' is-active' : ''}`}
                    onClick={() => {
                      setActiveCluster(c.key);
                      fitIds(clusterIds(c.key));
                    }}
                  >
                    <span className="row-text">{c.name}</span>
                    <span className="row-count">{c.count}</span>
                  </button>
                  {activeCluster === c.key && c.blurb && (
                    <p className="row-note">{c.blurb}</p>
                  )}
                </div>
              ))}
            {railTab === 'threads' &&
              (data.threads.length === 0 ? (
                <p className="row-note">No threads yet — synthesis pending.</p>
              ) : (
                data.threads.map((t) => (
                  <div key={t.key}>
                    <button
                      type="button"
                      className={`row${threadKey === t.key ? ' is-active' : ''}`}
                      onClick={() => {
                        if (threadKey === t.key) {
                          setThreadKey(null);
                        } else {
                          clearFocus();
                          setThreadKey(t.key);
                          fitIds(t.members);
                        }
                      }}
                    >
                      <span className="row-text">{t.name}</span>
                      <span className="row-count">{t.members.length}</span>
                    </button>
                    {threadKey === t.key && t.note && <p className="row-note">{t.note}</p>}
                  </div>
                ))
              ))}
            {railTab === 'insights' &&
              (data.insights.length === 0 ? (
                <p className="row-note">No insights yet — synthesis pending.</p>
              ) : (
                data.insights.map((ins, i) => (
                  <div key={`${ins.title}-${i}`}>
                    <button
                      type="button"
                      className={`row row-insight${insightIdx === i ? ' is-active' : ''}`}
                      onClick={() => {
                        if (insightIdx === i) {
                          setInsightIdx(null);
                        } else {
                          clearFocus();
                          setInsightIdx(i);
                          fitIds(ins.relatedIds);
                        }
                      }}
                    >
                      <span className="row-kind">{KIND_LABEL[ins.kind] ?? ins.kind}</span>
                      <span className="row-text">{ins.title}</span>
                    </button>
                    {insightIdx === i && <p className="row-note">{ins.body}</p>}
                  </div>
                ))
              ))}
          </div>
        </aside>

        <div
          ref={stageRef}
          className={`stage${panning ? ' is-panning' : ''}${altDown || marquee ? ' is-zoom' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!lastDragMoved.current) setSel(null);
          }}
          onScroll={(e) => {
            // The stage must never scroll natively (focus/scrollIntoView can
            // scroll overflow:hidden containers and desync the transform).
            e.currentTarget.scrollTo(0, 0);
          }}
        >
          <div
            className={`world${nodesAnimate ? ' animate' : ''}`}
            style={
              {
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                '--k': view.k,
              } as React.CSSProperties
            }
          >
            <svg className="edges" aria-hidden="true">
              <g className="edges-underlay">
                {underlayPaths.map((p, i) => (
                  <path key={i} d={p} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              <g className="edges-focus">
                {focusEdges.map((p, i) => (
                  <path key={i} d={p} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              {threadPath && (
                <path className="edge-thread" d={threadPath} vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            <World
              layout={layout}
              sel={sel}
              activeIds={activeIds}
              onSelect={onSelect}
              onHover={onHover}
            />
          </div>
          {marquee && (
            <div
              className="marquee"
              aria-hidden="true"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}
          {activeInsight && (
            <div className="insight-banner" role="status">
              <span className="row-kind">{KIND_LABEL[activeInsight.kind] ?? activeInsight.kind}</span>
              <strong>{activeInsight.title}</strong>
              <button type="button" onClick={() => setInsightIdx(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
        </div>

        {selNode && (
          <Panel node={selNode} onTag={setTag} onJump={jumpTo} onClose={() => setSel(null)} />
        )}
      </div>

      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
      <DetailsModal
        node={modalId ? (nodesById.get(modalId) ?? null) : null}
        onClose={() => setModalId(null)}
      />
    </div>
  );
}
