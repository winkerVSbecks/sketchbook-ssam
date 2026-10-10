/**
 * Layout lenses for the Atlas. Each lens maps every node id to a top-left
 * position in world coordinates and emits group labels. Layouts are pure and
 * deterministic — same data, same map — so the canvas is stable across loads
 * (arrangement from rules applied uniformly, not per-view taste).
 */
import { NODE_W, nodeH, type AtlasNode, type Cluster, type ColorSystem } from './model.ts';

export type Pt = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GroupLabel = { text: string; sub?: string; x: number; y: number };
/** A strip of colour cells in world space (one sampled palette). */
export type SwatchRow = { x: number; y: number; w: number; h: number; colors: string[] };
export type Layout = {
  pos: Map<string, Pt>;
  labels: GroupLabel[];
  bounds: Bounds;
  swatches?: SwatchRow[];
};

export type LensKey = 'clusters' | 'series' | 'timeline' | 'systems';

const GAP = 10;
const HEADER = 36;
const BLOCK_GAP_X = 116;
const BLOCK_GAP_Y = 132;

const byDate = (a: AtlasNode, b: AtlasNode) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

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
  /** sample palettes drawn as strips between the label and the grid */
  swatches?: string[][];
  /** start a new shelf before this block */
  breakBefore?: boolean;
};

type BlockExtra = Pick<Block, 'swatches' | 'breakBefore'> & { minW?: number };

const SWATCH_H = 18;
const SWATCH_GAP = 4;
const SWATCH_PAD = 14;
const swatchesH = (rows: string[][] | undefined) =>
  rows?.length ? rows.length * (SWATCH_H + SWATCH_GAP) - SWATCH_GAP + SWATCH_PAD : 0;

function gridBlock(items: AtlasNode[], label: string, sub: string, extra: BlockExtra = {}): Block {
  const cols = Math.max(1, Math.min(14, Math.ceil(Math.sqrt(items.length * 1.7))));
  const rows: AtlasNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  const rowHs = rows.map((row) => Math.max(...row.map(nodeH)));
  const gridW = Math.min(cols, items.length) * (NODE_W + GAP) - GAP;
  const w = Math.max(gridW, extra.minW ?? 0);
  const h = rowHs.reduce((a, rh) => a + rh + GAP, -GAP) + swatchesH(extra.swatches);
  const { swatches, breakBefore } = extra;
  return { label, sub, rows, rowHs, w, h, swatches, breakBefore };
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
  const swatches: SwatchRow[] = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const b of blocks) {
    if (x > 0 && (b.breakBefore || x + b.w > rowMaxW)) {
      x = 0;
      y += shelfH + BLOCK_GAP_Y;
      shelfH = 0;
    }
    labels.push({ text: b.label, sub: b.sub, x, y });
    let yy = y + HEADER;
    for (const colors of b.swatches ?? []) {
      swatches.push({ x, y: yy, w: b.w, h: SWATCH_H, colors });
      yy += SWATCH_H + SWATCH_GAP;
    }
    if (b.swatches?.length) yy += SWATCH_PAD - SWATCH_GAP;
    b.rows.forEach((row, ri) => {
      row.forEach((n, ci) => pos.set(n.id, { x: x + ci * (NODE_W + GAP), y: yy }));
      yy += b.rowHs[ri]! + GAP;
    });
    shelfH = Math.max(shelfH, b.h + HEADER);
    x += b.w + BLOCK_GAP_X;
  }
  return { pos, labels, swatches, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
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

// ---------- systems (one room per src/colors colour system) ----------

/** Rooms are at least this wide so a system's swatches read even when few
 * sketches use it. */
const SYSTEM_MIN_W = 5 * (NODE_W + GAP) - GAP;

/**
 * Each colour system in src/colors gets a room: its name, sampled palettes as
 * swatch strips, then the sketches that draw from it (a sketch using several
 * sits with the one it imports first). Rooms run busiest first. Sketches that
 * use no src/colors system follow on a new shelf, grouped by their code-read
 * palette tag (hand-picked hex, monochrome, external libraries…).
 */
export function systemsLayout(nodes: AtlasNode[], systems: ColorSystem[]): Layout {
  const bySystem = new Map<string, AtlasNode[]>(systems.map((s) => [s.key, []]));
  const byTag = new Map<string, AtlasNode[]>();
  for (const n of nodes) {
    const primary = n.colorSystems.find((k) => bySystem.has(k));
    if (primary) bySystem.get(primary)!.push(n);
    else {
      const list = byTag.get(n.palette) ?? [];
      list.push(n);
      byTag.set(n.palette, list);
    }
  }
  const usesOf = (key: string) => nodes.filter((n) => n.colorSystems.includes(key)).length;

  const systemBlocks = systems
    .map((s, order) => ({ s, order, items: bySystem.get(s.key)!.sort(byDate) }))
    .sort((a, b) => b.items.length - a.items.length || a.order - b.order)
    .map(({ s, items }) => {
      // Labels counter-scale at far zoom, so the sub stays as short as the
      // other lenses' counts: "42 +9" = 42 here, 9 more filed under another.
      const shared = usesOf(s.key) - items.length;
      const sub = `${items.length}${shared > 0 ? ` +${shared}` : ''}`;
      return gridBlock(items, s.name, sub, { swatches: s.samples, minW: SYSTEM_MIN_W });
    });

  const tagBlocks = [...byTag.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([tag, items], i) =>
      // The first sub names the shelf; the rest are bare counts.
      gridBlock(items.sort(byDate), tag, `${items.length}${i === 0 ? ' · not src/colors' : ''}`, {
        breakBefore: i === 0,
      }),
    );

  const layout = shelfPack([...systemBlocks, ...tagBlocks]);
  layout.bounds = layoutBounds(nodes, layout.pos);
  // Empty rooms hold only swatches; keep them and the labels inside fit-view.
  for (const r of layout.swatches ?? []) {
    layout.bounds.maxX = Math.max(layout.bounds.maxX, r.x + r.w);
    layout.bounds.maxY = Math.max(layout.bounds.maxY, r.y + r.h);
  }
  layout.bounds.minY = Math.min(layout.bounds.minY, 0);
  return layout;
}

export function computeLayout(
  lens: LensKey,
  nodes: AtlasNode[],
  clusters: Cluster[],
  systems: ColorSystem[],
): Layout {
  switch (lens) {
    case 'clusters':
      return clustersLayout(nodes, clusters);
    case 'series':
      return seriesLayout(nodes);
    case 'timeline':
      return timelineLayout(nodes, clusters);
    case 'systems':
      return systemsLayout(nodes, systems);
  }
}
