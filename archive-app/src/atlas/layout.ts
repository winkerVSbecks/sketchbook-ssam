/**
 * Layout lenses for the Atlas. Each lens maps every node id to a top-left
 * position in world coordinates and emits group labels. Layouts are pure and
 * deterministic — same data, same map — so the canvas is stable across loads
 * (arrangement from rules applied uniformly, not per-view taste).
 */
import { NODE_W, nodeH, type AtlasNode, type Cluster } from './model.ts';

export type Pt = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GroupLabel = { text: string; sub?: string; x: number; y: number };
export type Layout = { pos: Map<string, Pt>; labels: GroupLabel[]; bounds: Bounds };

export type LensKey = 'clusters' | 'series' | 'timeline' | 'spectrum';

const GAP = 10;
const HEADER = 36;
const BLOCK_GAP_X = 116;
const BLOCK_GAP_Y = 132;

const byDate = (a: AtlasNode, b: AtlasNode) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/** Deterministic 0..1 from a string, for tie-breaking jitter. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 9973) / 9973;
}

export function layoutBounds(nodes: AtlasNode[], pos: Map<string, Pt>): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x + NODE_W);
    b.maxY = Math.max(b.maxY, p.y + nodeH(n));
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return b;
}

export function boundsOfIds(
  ids: string[],
  nodesById: Map<string, AtlasNode>,
  pos: Map<string, Pt>,
): Bounds {
  const nodes = ids.map((id) => nodesById.get(id)).filter((n): n is AtlasNode => !!n);
  return layoutBounds(nodes, pos);
}

// ---------- grid blocks on shelves (clusters & series lenses) ----------

type Block = {
  label: string;
  sub: string;
  rows: AtlasNode[][];
  rowHs: number[];
  w: number;
  h: number;
};

function gridBlock(items: AtlasNode[], label: string, sub: string): Block {
  const cols = Math.max(1, Math.min(14, Math.ceil(Math.sqrt(items.length * 1.7))));
  const rows: AtlasNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  const rowHs = rows.map((row) => Math.max(...row.map(nodeH)));
  const w = Math.min(cols, items.length) * (NODE_W + GAP) - GAP;
  const h = rowHs.reduce((a, rh) => a + rh + GAP, -GAP);
  return { label, sub, rows, rowHs, w, h };
}

function shelfPack(blocks: Block[]): Layout {
  const totalArea = blocks.reduce(
    (a, b) => a + (b.w + BLOCK_GAP_X) * (b.h + HEADER + BLOCK_GAP_Y),
    0,
  );
  // Aim for a canvas wider than tall, like a wall of framed groups.
  const rowMaxW = Math.max(1500, Math.round(Math.sqrt(totalArea * 2.1)));

  const pos = new Map<string, Pt>();
  const labels: GroupLabel[] = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > rowMaxW) {
      x = 0;
      y += shelfH + BLOCK_GAP_Y;
      shelfH = 0;
    }
    labels.push({ text: b.label, sub: b.sub, x, y });
    let yy = y + HEADER;
    b.rows.forEach((row, ri) => {
      row.forEach((n, ci) => pos.set(n.id, { x: x + ci * (NODE_W + GAP), y: yy }));
      yy += b.rowHs[ri]! + GAP;
    });
    shelfH = Math.max(shelfH, b.h + HEADER);
    x += b.w + BLOCK_GAP_X;
  }
  return { pos, labels, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
}

export function clustersLayout(nodes: AtlasNode[], clusters: Cluster[]): Layout {
  const byCluster = new Map<string, AtlasNode[]>();
  for (const n of nodes) {
    const list = byCluster.get(n.cluster) ?? [];
    list.push(n);
    byCluster.set(n.cluster, list);
  }
  const order = clusters.filter((c) => byCluster.has(c.key));
  // Any cluster key not in the clusters list still gets a block at the end.
  const extraKeys = [...byCluster.keys()].filter((k) => !order.some((c) => c.key === k));
  const blocks = [
    ...order.map((c) =>
      gridBlock(byCluster.get(c.key)!.sort(byDate), c.name, `${byCluster.get(c.key)!.length}`),
    ),
    ...extraKeys.sort().map((k) =>
      gridBlock(byCluster.get(k)!.sort(byDate), k, `${byCluster.get(k)!.length}`),
    ),
  ];
  const layout = shelfPack(blocks);
  layout.bounds = layoutBounds(nodes, layout.pos);
  return layout;
}

export function seriesLayout(nodes: AtlasNode[]): Layout {
  const bySeries = new Map<string, AtlasNode[]>();
  for (const n of nodes) {
    const key = n.seriesLabel ?? 'one-offs';
    const list = bySeries.get(key) ?? [];
    list.push(n);
    bySeries.set(key, list);
  }
  const groups = [...bySeries.entries()].map(([label, items]) => ({
    label,
    items: items.sort(byDate),
    first: items.reduce((a, n) => (n.date < a ? n.date : a), '9999'),
  }));
  groups.sort((a, b) => a.first.localeCompare(b.first) || a.label.localeCompare(b.label));
  const blocks = groups.map((g) => gridBlock(g.items, g.label, `${g.items.length}`));
  const layout = shelfPack(blocks);
  layout.bounds = layoutBounds(nodes, layout.pos);
  return layout;
}

// ---------- timeline (month columns × cluster lanes) ----------

export function timelineLayout(nodes: AtlasNode[], clusters: Cluster[]): Layout {
  const months = [...new Set(nodes.map((n) => n.date))].sort();
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const CELL_COLS = 2;
  const colW = CELL_COLS * (NODE_W + GAP) + 36;

  const laneKeys = [
    ...clusters.map((c) => c.key).filter((k) => nodes.some((n) => n.cluster === k)),
    ...[...new Set(nodes.map((n) => n.cluster))].filter(
      (k) => !clusters.some((c) => c.key === k),
    ),
  ];

  const pos = new Map<string, Pt>();
  const labels: GroupLabel[] = [];
  let laneY = 0;
  for (const key of laneKeys) {
    const laneNodes = nodes.filter((n) => n.cluster === key).sort(byDate);
    if (laneNodes.length === 0) continue;
    const unitH = Math.max(...laneNodes.map(nodeH)) + GAP;
    // rows needed = the fullest month cell in this lane
    const perMonth = new Map<string, number>();
    for (const n of laneNodes) perMonth.set(n.date, (perMonth.get(n.date) ?? 0) + 1);
    const maxRows = Math.max(...[...perMonth.values()].map((c) => Math.ceil(c / CELL_COLS)));
    const laneH = maxRows * unitH + 28;

    const name = clusters.find((c) => c.key === key)?.name ?? key;
    labels.push({ text: name, sub: `${laneNodes.length}`, x: -300, y: laneY });

    const cellCursor = new Map<string, number>();
    for (const n of laneNodes) {
      const i = cellCursor.get(n.date) ?? 0;
      cellCursor.set(n.date, i + 1);
      pos.set(n.id, {
        x: monthIndex.get(n.date)! * colW + (i % CELL_COLS) * (NODE_W + GAP),
        y: laneY + 28 + Math.floor(i / CELL_COLS) * unitH,
      });
    }
    laneY += laneH + 56;
  }
  months.forEach((m, i) => {
    labels.push({ text: m.replace('-', '.'), x: i * colW, y: -44 });
  });
  const layout = { pos, labels, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
  layout.bounds = layoutBounds(nodes, pos);
  // Include the lane labels in the bounds so fit-view never clips them.
  layout.bounds.minX = Math.min(layout.bounds.minX, -300);
  layout.bounds.minY = Math.min(layout.bounds.minY, -60);
  return layout;
}

// ---------- spectrum (hue wheel + achromatic column) ----------

export function spectrumLayout(nodes: AtlasNode[]): Layout {
  const chromatic: AtlasNode[] = [];
  const mono: AtlasNode[] = [];
  for (const n of nodes) {
    if (n.metrics && n.metrics.hue !== null && n.metrics.meanC >= 0.025) chromatic.push(n);
    else mono.push(n);
  }

  type Item = { n: AtlasNode; x: number; y: number; tx: number; ty: number; r: number };
  const items: Item[] = chromatic.map((n) => {
    const m = n.metrics!;
    const theta = ((m.hue! - 90) * Math.PI) / 180; // red family at the top
    const cNorm = Math.min(1, Math.max(0, (m.meanC - 0.02) / 0.12));
    const r = 460 + cNorm * 950 + hash01(n.id) * 60;
    const tx = Math.cos(theta) * r - NODE_W / 2;
    const ty = Math.sin(theta) * r - nodeH(n) / 2;
    return { n, x: tx, y: ty, tx, ty, r: 46 };
  });

  // Relax overlaps while holding to targets: quiet, even spacing.
  const CELL = 96;
  for (let iter = 0; iter < 90; iter++) {
    for (const it of items) {
      it.x += (it.tx - it.x) * 0.05;
      it.y += (it.ty - it.y) * 0.05;
    }
    const grid = new Map<string, Item[]>();
    for (const it of items) {
      const key = `${Math.floor(it.x / CELL)}:${Math.floor(it.y / CELL)}`;
      const cell = grid.get(key) ?? [];
      cell.push(it);
      grid.set(key, cell);
    }
    for (const it of items) {
      const cx = Math.floor(it.x / CELL);
      const cy = Math.floor(it.y / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const other of grid.get(`${gx}:${gy}`) ?? []) {
            if (other === it) continue;
            const dx = other.x - it.x;
            const dy = other.y - it.y;
            const d = Math.hypot(dx, dy) || 0.001;
            const min = it.r + other.r;
            if (d < min) {
              const push = (min - d) / 2 / d;
              it.x -= dx * push;
              it.y -= dy * push;
              other.x += dx * push;
              other.y += dy * push;
            }
          }
        }
      }
    }
  }

  const pos = new Map<string, Pt>();
  for (const it of items) pos.set(it.n.id, { x: Math.round(it.x), y: Math.round(it.y) });

  // Achromatic work: a calm column to the right, light to dark.
  mono.sort(
    (a, b) => (b.metrics?.meanL ?? 0) - (a.metrics?.meanL ?? 0) || a.id.localeCompare(b.id),
  );
  const stripX = 1900;
  const stripCols = 6;
  let sy = -Math.ceil(mono.length / stripCols / 2) * (NODE_W + GAP);
  const stripTop = sy - 44;
  mono.forEach((n, i) => {
    const ci = i % stripCols;
    const ri = Math.floor(i / stripCols);
    pos.set(n.id, { x: stripX + ci * (NODE_W + GAP), y: sy + ri * (85 + GAP) });
  });

  const labels: GroupLabel[] = [
    { text: 'chromatic', sub: 'angle = hue · radius = chroma', x: -1480, y: -1440 },
    { text: 'achromatic', sub: 'light → dark', x: stripX, y: stripTop },
  ];
  const nodesAll = [...chromatic, ...mono];
  return { pos, labels, bounds: layoutBounds(nodesAll, pos) };
}

export function computeLayout(
  lens: LensKey,
  nodes: AtlasNode[],
  clusters: Cluster[],
): Layout {
  switch (lens) {
    case 'clusters':
      return clustersLayout(nodes, clusters);
    case 'series':
      return seriesLayout(nodes);
    case 'timeline':
      return timelineLayout(nodes, clusters);
    case 'spectrum':
      return spectrumLayout(nodes);
  }
}
