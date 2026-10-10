/**
 * domain-desktop — the domain partition, opened as a terminal desktop.
 *
 * domain-polygon/window redraws a domain partition as macOS windows; here the
 * same partition (../domain-polygon/domain-polygon-system) is fed into the
 * glyph desktop of src/tui. Every region of the partition opens as a
 * box-drawing window sized exactly to its cell, so the desktop tiles with no
 * gaps and no hand-placed layout. Each window's inner area draws its own glyph
 * fill — chosen from the region's shape, not by hand — and the partition's
 * polygon crosses every window as a solid mass, the way domain-polygon/basic
 * fills its parts. Island domains (full-span, selected) invert: they are all
 * fill, with the polygon cut out of them.
 *
 * The windows are live: drag, resize, minimise; `+ new` re-partitions,
 * settings changes the grid resolution or retints. The grid defaults to 8×8
 * and a sparse deal is re-dealt from the same seed, so the desktop opens with
 * at least eight windows on almost every seed.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { randomPalette } from '../../colors';
import {
  cellRect,
  createButton,
  createDesktop,
  createToggleGroup,
  isEmptyCellRect,
  type CellRect,
  type Desktop,
  type GlyphBuffer,
  type TuiControl,
  type TuiWindow,
} from '../../tui';
import { generateDomainSystem, isIsland } from '../domain-polygon/domain-polygon-system';
import type { Domain } from '../domain-polygon/types';

type Point = [number, number];

/** Glyph fills, ordered from open to dense; a region's shape picks its place. */
const FILLS = ['·', '─', '│', '╱', '╲', '┼', '░', '═', '║', '╳', '▒', '▚'] as const;
// Finer grids give more windows: across 30 seeds the median window count
// is ~4 at 4×4, 6 at 6×6, 9 at 8×8 and 11 at 9×9 (the merge passes eat the rest).
const RESOLUTIONS: [number, number][] = [
  [6, 6],
  [7, 7],
  [8, 8],
  [9, 9],
  [10, 10],
];
const DEFAULT_RES: [number, number] = [8, 8];
/** A partition with fewer usable windows than this is re-dealt from the same seed. */
const MIN_WINDOWS = 8;
/** How many deals of one seed to try before keeping the fullest one. */
const DEALS = 12;
/** Smallest region that still opens as a window (box border plus a line of fill). */
const MIN_ROWS = 3;
const MIN_COLS = 6;

/** Ray-cast point-in-polygon. */
function inside(x: number, y: number, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** One partition region as a window. */
interface Pane {
  domain: Domain;
  /** Index into `FILLS`. */
  fill: number;
  island: boolean;
  /** The region's cell rect when the partition was built (world frame of its fill). */
  home: CellRect;
}

export const sketch = ({ wrap, context, canvas, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      desktop.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  let seed = Random.getRandomSeed();
  let res: [number, number] = DEFAULT_RES;
  let rawPalette = randomPalette();
  let showPolygon = true;
  /** The partition polygon, in desktop cell space (x = col, y = row). */
  let polygon: Point[] = [];
  const panes = new Map<TuiWindow, Pane>();

  // ─── Drawing a pane ─────────────────────────────────────────────────────────

  /**
   * The fill is anchored to the region's home rect, not to the window, so a
   * dragged window carries its own patch of the partition with it: the
   * polygon inside it is the part that was under its cell.
   */
  const drawPane = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    const pane = panes.get(win);
    if (!pane || isEmptyCellRect(inner)) return;
    const theme = desktop.theme;
    const glyph = FILLS[pane.fill];
    const dRow = pane.home.row + 1 - inner.row;
    const dCol = pane.home.col + 1 - inner.col;
    for (let r = 0; r < inner.rows; r++) {
      for (let c = 0; c < inner.cols; c++) {
        const row = inner.row + r;
        const col = inner.col + c;
        const x = col + dCol + 0.5;
        const y = row + dRow + 0.5;
        const inPoly = showPolygon && polygon.length > 2 && inside(x, y, polygon);
        if (pane.island) {
          // Inverted: the island is all fill, with the polygon cut out of it.
          if (!inPoly) buf.put(row, col, glyph, theme.fg);
          continue;
        }
        if (inPoly) {
          // The polygon's rim takes the accent so the mass reads as one shape across frames.
          const rim =
            !inside(x - 1, y, polygon) ||
            !inside(x + 1, y, polygon) ||
            !inside(x, y - 1, polygon) ||
            !inside(x, y + 1, polygon);
          const ink = rim ? theme.accent : theme.fg;
          // Background as well as glyph, so the mass is solid across line gaps.
          buf.put(row, col, '█', ink, ink);
        } else {
          buf.put(row, col, glyph, theme.dim);
        }
      }
    }
  };

  // ─── Building the desktop from a partition ──────────────────────────────────

  const regionRect = (d: Domain, area: CellRect): CellRect => {
    const c0 = area.col + Math.round((d.region.x / res[0]) * area.cols);
    const c1 = area.col + Math.round(((d.region.x + d.region.width) / res[0]) * area.cols);
    const r0 = area.row + Math.round((d.region.y / res[1]) * area.rows);
    const r1 = area.row + Math.round(((d.region.y + d.region.height) / res[1]) * area.rows);
    return cellRect(r0, c0, r1 - r0, c1 - c0);
  };

  /**
   * A region's fill comes from its shape: aspect picks the direction family
   * (wide → horizontal strokes, tall → vertical, square → crossings), area
   * picks the density within it.
   */
  const fillFor = (d: Domain): number => {
    const { width: w, height: h } = d.region;
    const areaRank = Math.min(3, Math.floor(((w * h) / (res[0] * res[1])) * 12));
    const family = w > h ? [1, 7, 0, 10] : h > w ? [2, 8, 0, 10] : [5, 9, 6, 11];
    const diag = (d.region.x + d.region.y) % 2 === 0 ? 3 : 4;
    return areaRank === 0 && w === h ? diag : family[areaRank];
  };

  const usable = (rect: CellRect) => rect.rows >= MIN_ROWS && rect.cols >= MIN_COLS;

  /**
   * One seed, dealt up to `DEALS` times (sub-seeds `seed/0`, `seed/1`, …):
   * the merge passes can leave a fine grid with only a few big regions, so
   * the first deal with at least `MIN_WINDOWS` usable regions wins, else the
   * fullest. Same seed, same desktop.
   */
  const partition = (area: CellRect, worldW: number, worldH: number) => {
    let best: ReturnType<typeof generateDomainSystem> | null = null;
    let bestCount = -1;
    for (let deal = 0; deal < DEALS; deal++) {
      Random.setSeed(`${seed}/${deal}`);
      const system = generateDomainSystem(
        res,
        0,
        worldW,
        worldH,
        {
          inset: [0, 0, 0, 0],
          doCombineSmallRegions: true,
          doCombineNarrowRegions: true,
          doReduceNarrowRegions: true,
        },
        { x: 0, y: 0, w: worldW, h: worldH },
      );
      const count = system.domains.filter((d) => usable(regionRect(d, area))).length;
      if (count > bestCount) {
        best = system;
        bestCount = count;
      }
      if (count >= MIN_WINDOWS) break;
    }
    return best!;
  };

  const build = () => {
    for (const win of [...desktop.windows]) desktop.removeWindow(win);
    panes.clear();
    const area = desktop.area;
    const aspect = desktop.metrics.lineH / desktop.metrics.charW;
    // The system works in square world units: one column wide, `aspect` columns per row.
    const worldW = area.cols;
    const worldH = area.rows * aspect;
    const { domains, polygon: poly } = partition(area, worldW, worldH);
    polygon = (poly as Point[]).map(([x, y]) => [area.col + x, area.row + y / aspect]);
    // Largest regions first, so the small ones sit in front and stay grabbable.
    const sorted = [...domains].sort(
      (a, b) => b.region.width * b.region.height - a.region.width * a.region.height,
    );
    sorted.forEach((d, i) => {
      const rect = regionRect(d, area);
      if (!usable(rect)) return;
      const island = isIsland(d);
      const label = `${island ? 'island' : 'region'} ${String(i + 1).padStart(2, '0')}`;
      const win = desktop.addWindow({
        title: `${label} · ${d.region.width}×${d.region.height}`,
        rect,
        minRows: 3,
        minCols: 8,
        draw: drawPane,
        onClose: (w) => {
          panes.delete(w);
          desktop.removeWindow(w);
        },
      });
      panes.set(win, { domain: d, fill: fillFor(d), island, home: rect });
    });
  };

  const repartition = () => {
    seed = Random.getRandomSeed();
    build();
    props.render();
  };

  const controls: TuiControl[] = [
    createToggleGroup({
      exclusive: true,
      active: [`${res[0]}×${res[1]}`],
      items: RESOLUTIONS.map(([c, r]) => ({ id: `${c}×${r}`, label: `${c}×${r}` })),
      onChange: (active) => {
        const pick = RESOLUTIONS.find(([c, r]) => active.includes(`${c}×${r}`));
        if (pick) res = pick;
        build();
        props.render();
      },
    }),
    createToggleGroup({
      active: ['polygon'],
      items: [{ id: 'polygon', label: 'polygon' }],
      onChange: (active) => {
        showPolygon = active.includes('polygon');
        props.render();
      },
    }),
    createButton({ id: 'repartition', label: 'repartition', onPress: repartition }),
    createButton({
      id: 'palette',
      label: 'new palette',
      onPress: () => {
        rawPalette = randomPalette();
        desktop.setTheme(rawPalette);
        props.render();
      },
    }),
  ];

  const desktop: Desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    palette: rawPalette,
    settings: { controls, cols: 30 },
    status: () => `seed ${seed} · ${res[0]}×${res[1]} grid · ${panes.size} windows`,
    onNewWindow: repartition,
    onChange: () => props.render(),
  });

  build();

  wrap.resize = ({ width, height }: SketchProps) => {
    desktop.resize(width, height);
    build();
  };

  wrap.render = () => {
    desktop.render();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // No `dimensions`: ssam sizes the canvas to the viewport and calls `wrap.resize`.
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
