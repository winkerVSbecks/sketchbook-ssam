/**
 * The sketch body shared by `nalee-whitespace` and `jali`: differential
 * growth packing a polyomino grown from the centre of a square grid, the rest
 * of the grid's cells tiled by nalee walks on a finer lattice.
 *
 * The organism packs the domain (see ./differential-growth); each empty cell
 * is split into a `sub`×`sub` lattice and nalee walkers (hold a direction,
 * bounce at walls, die when boxed in, spawn until every node is taken) tile
 * the whole white space as one connected field of orthogonal paths. The pitch
 * is close to the curve's own spacing, so both halves carry the same density
 * — one grown, one walked.
 *
 * On a paper ground (slate when reversed) the domain is washed in the low
 * tier and its curve drawn in the high-tier ink, ≈7.5:1 apart; the walks take
 * the mid-tier accent. `grill` outlines the domain with khidki's bars and
 * puts circles and diamonds on its vertices; `windowed` covers a window
 * frame's opening with the field and clips it there (./window-frame). Every
 * parameter lives in the tweakpane: layout and growth rebuild from the same
 * seed, colour only redraws. Not a sketch file itself — it exports no `sketch`; the variant
 * wires HMR and export, calling the returned cleanup on dispose.
 */
import type { SketchProps } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { cuspPalette } from '../../colors/cusphanger';
import { createGrowth, type Growth } from '../terminal-ui/growth-sim';
import {
  createConfiner,
  createMask,
  naleeWalks,
  outline,
  regionRects,
  type Edge,
  type LatticePoint,
  type Rect,
} from './region';
import { WINDOW_STYLES, windowFrame, type WindowStyle } from './window-frame';

/** World units per grid cell. */
const CELL = 6;
/** Upper bound on the warm-up, however many steps are asked for. */
const WARMUP_MS = 6000;
/** Node budget per world unit² of domain at the default spacing. */
const NODES_PER_AREA = 7.5;
const DEFAULT_RADIUS = 0.9;

interface Params {
  /** Layout seed: the domain, the walks and the organism's own seed. */
  seed: string;
  /** Grid cells per side. */
  grid: number;
  /** Share of the grid the polyomino takes. */
  share: number;
  /** Lattice nodes per side of an empty cell. */
  sub: number;
  /** Longest walk, in multiples of `sub`. */
  walkLength: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Line width (curve and walks) as a fraction of the radius. */
  stroke: number;
  /** Steps run before the first frame. */
  warmup: number;
  /** Steps run per frame; 0 freezes the growth. */
  speed: number;
  /** Colour seed: the palette's ring, shuffle and jitter. */
  paletteSeed: string;
  hue: number;
  /** Hues taken off the ring, in ring order from the base: the fill keeps to
   * two (the growth takes the base, the walks the next); any more go to the
   * frame's faces. */
  hues: number;
  /** Degrees between ring hues. */
  angle: number;
  saturation: number;
  /** WCAG targets against the ground: curve, walks, domain wash. */
  ink: number;
  accent: number;
  wash: number;
  /** Wash the domain behind the curve. */
  fill: boolean;
  /** Slate ground instead of paper. */
  reverse: boolean;
  /** Hairline outline of the domain. */
  debug: boolean;
  /** Windowed variants: the frame the field is seen through. */
  window: WindowStyle;
  /** Bar thickness of the grill round the growth, in world units (cell is 6). */
  bar: number;
  /** Circle and diamond size on the grill's knots, relative to the cell. */
  knot: number;
}

export interface WhitespaceSketchOptions {
  title: string;
  /** Clip the field to a window frame, with a frame control. */
  windowed?: boolean;
  /** Overrides on the defaults, drawn after the layout seed is set. */
  defaults?: () => Partial<Params>;
  /** Outline the growth's domain with khidki-style bars, circles and diamonds. */
  grill?: boolean;
}

interface Layout {
  growth: Growth;
  walks: LatticePoint[][];
  rects: Rect[];
  edges: Edge[];
  /** Every vertex of the domain's outline, in world units, with its grid parity. */
  knots: { x: number; y: number; circle: boolean }[];
  step(): void;
}

/**
 * A nalee-style clipped domain: start from the centre cell and keep adding a
 * random cell that touches the shape, so it stays one orthogonally connected
 * piece with arms and notches the system chose, not a hand-drawn outline.
 */
function growDomain(grid: number, share: number): boolean[][] {
  const cells = Array.from({ length: grid }, () => Array<boolean>(grid).fill(false));
  const c = Math.floor(grid / 2);
  cells[c][c] = true;
  const target = Math.max(1, Math.round(grid * grid * share));
  for (let count = 1; count < target; count++) {
    const frontier: [number, number][] = [];
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        if (cells[y][x]) continue;
        if (cells[y - 1]?.[x] || cells[y + 1]?.[x] || cells[y][x - 1] || cells[y][x + 1]) {
          frontier.push([x, y]);
        }
      }
    }
    const [x, y] = Random.pick(frontier);
    cells[y][x] = true;
  }
  return cells;
}

function buildLayout(p: Params): Layout {
  Random.setSeed(p.seed);
  console.log(p.seed);

  const cells = growDomain(p.grid, p.share);
  const mask = createMask(p.grid, p.grid, CELL);
  cells.forEach((row, y) => row.forEach((on, x) => on && (mask.ids[y * p.grid + x] = 0)));
  const confine = createConfiner(mask, p.radius * 0.5);
  const area = mask.ids.filter((id) => id === 0).length * CELL * CELL;

  const c = Math.floor(p.grid / 2);
  const growth = createGrowth({
    seed: Random.rangeFloor(1, 0xffffff),
    origin: { x: (c + 0.5) * CELL, y: (c + 0.5) * CELL },
    radius: 1.5,
    repulsionRadius: p.radius,
    maxNodes: Math.round(area * NODES_PER_AREA * (DEFAULT_RADIUS / p.radius)),
  });

  // The white space: a lattice over the empty cells, walked the nalee way.
  const lattice = p.grid * p.sub;
  const walks = naleeWalks(
    lattice,
    lattice,
    (x, y) => !cells[Math.floor(y / p.sub)][Math.floor(x / p.sub)],
    () => Random.rangeFloor(p.sub, p.sub * p.walkLength + 1),
  );

  // The outline's vertices, each once, for the grill's knots.
  const edges = outline(mask);
  const seen = new Map<string, { x: number; y: number; circle: boolean }>();
  for (const [x0, y0, x1, y1] of edges) {
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ]) {
      const key = `${x},${y}`;
      if (!seen.has(key)) seen.set(key, { x, y, circle: (Math.round(x / CELL) + Math.round(y / CELL)) % 2 === 0 });
    }
  }
  const knots = [...seen.values()];

  return {
    growth,
    walks,
    rects: regionRects(mask).get(0) ?? [],
    edges,
    knots,
    step() {
      growth.step();
      for (const n of growth.state.nodes) confine(0, n);
    },
  };
}

export const whitespaceSketch =
  (o: WhitespaceSketchOptions) =>
  ({ wrap, context, ...props }: SketchProps): (() => void) => {
    const seed = Random.getRandomSeed();
    Random.setSeed(seed);
    const params: Params = {
      seed,
      grid: 11,
      share: 0.42,
      sub: 7,
      walkLength: 30,
      radius: DEFAULT_RADIUS,
      stroke: 0.4,
      warmup: 1400,
      speed: 2,
      paletteSeed: Random.getRandomSeed(),
      hue: 232,
      hues: 2,
      angle: 51,
      saturation: 1,
      ink: 12,
      accent: 4.5,
      wash: 1.6,
      fill: false,
      reverse: true,
      debug: false,
      window: 'arch',
      bar: 0.35,
      knot: 1,
      ...o.defaults?.(),
    };

    // Collapsed in the gallery, where every cell would otherwise carry one.
    const inGallery = new URLSearchParams(location.search).has('gallery');
    const pane = new Pane({ title: o.title, expanded: !inGallery }) as any;
    pane.element.parentElement.style.zIndex = '1';

    let layout: Layout;
    const colors = {
      bg: '',
      ink: '',
      walks: [] as string[],
      wash: '',
      hairline: '',
      bars: '',
      barShadow: '',
      circles: '',
      diamonds: '',
      frame: { front: '', top: '', side: '' },
    };

    const build = () => {
      layout = buildLayout(params);
      const t0 = performance.now();
      for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) layout.step();
    };

    // Hues come off the ring in order from the base (`shuffle: false`). The
    // fill keeps to two: the base for the growth, the next for every walk.
    // The frame's face and depth take the hues after those, wrapping round,
    // so with four or more its faces stand apart from the fill.
    const paint = () => {
      Random.setSeed(params.paletteSeed);
      const palette = cuspPalette({
        hue: params.hue,
        count: params.hues,
        angle: params.angle,
        shuffle: false,
        saturation: params.saturation,
        ground: params.reverse ? 'dark' : 'light',
        targets: { high: params.ink, mid: params.accent, low: params.wash },
      });
      const { high, mid, low } = palette.tiers;
      const n = palette.hues.length;
      // Tier index of the j-th hue round the ring from the base.
      const order = palette.ring.slice(0, n).map((h) => palette.hues.indexOf(h));
      const at = (j: number) => order[j % n];
      const base = at(0);
      colors.bg = palette.bg.css;
      // With a grill the fills recede to one contrast level (the mid tier),
      // leaving the high tier to the bars and knots so they stand out.
      colors.ink = (o.grill ? mid : high)[base].css;
      colors.wash = low[base].css;
      colors.hairline = mid[base].css;
      // The grill stands out in the high tier, sharing hues with the frame.
      colors.bars = high[at(2)].css;
      // The bars' depth face: their own colour at 60% lightness, darker on
      // either ground, like the shaded sides of khidki's thick lines.
      const b = high[at(2)].color;
      colors.barShadow = `oklch(${(b.l * 0.6).toFixed(4)} ${b.c.toFixed(4)} ${b.h.toFixed(2)})`;
      colors.circles = high[at(3)].css;
      colors.diamonds = high[at(4)].css;
      colors.walks = [mid[at(1)].css];
      // With one hue the side sits halfway down its ramp from mid to high.
      const [m, h] = [mid[base].color, high[base].color];
      colors.frame = {
        front: high[at(2)].css,
        top: mid[at(3)].css,
        side:
          n > 1
            ? mid[at(4)].css
            : `oklch(${((m.l + h.l) / 2).toFixed(4)} ${((m.c + h.c) / 2).toFixed(4)} ${m.h.toFixed(2)})`,
      };
    };

    const rebuild = () => {
      build();
      props.render();
    };
    const repaint = () => {
      paint();
      props.render();
    };

    // React once a drag settles, not on every intermediate value: a rebuild
    // re-runs the warm-up, which is too slow to chase a slider.
    const onInput = (binding: any, then: () => void) =>
      binding.on('change', (ev: { last?: boolean }) => {
        if (ev.last !== false) then();
      });

    const layoutFolder = pane.addFolder({ title: 'Layout' });
    if (o.windowed) {
      onInput(
        layoutFolder.addBinding(params, 'window', {
          options: Object.fromEntries(WINDOW_STYLES.map((w) => [w, w])),
        }),
        () => props.render(),
      );
    }
    if (o.grill) {
      onInput(layoutFolder.addBinding(params, 'bar', { min: 0, max: 2, step: 0.05 }), () => props.render());
      onInput(
        layoutFolder.addBinding(params, 'knot', { min: 0, max: 2.5, step: 0.05, label: 'circles' }),
        () => props.render(),
      );
    }
    onInput(layoutFolder.addBinding(params, 'grid', { min: 3, max: 15, step: 1 }), rebuild);
    onInput(layoutFolder.addBinding(params, 'share', { min: 0.05, max: 0.9, step: 0.01, label: 'domain share' }), rebuild);
    onInput(layoutFolder.addBinding(params, 'sub', { min: 2, max: 12, step: 1, label: 'walk lattice' }), rebuild);
    onInput(layoutFolder.addBinding(params, 'walkLength', { min: 1, max: 30, step: 1, label: 'walk length' }), rebuild);
    layoutFolder.addBinding(params, 'seed', { readonly: true });
    layoutFolder.addButton({ title: 'Regenerate' }).on('click', () => {
      params.seed = Random.getRandomSeed();
      pane.refresh();
      rebuild();
    });

    const growthFolder = pane.addFolder({ title: 'Growth' });
    onInput(growthFolder.addBinding(params, 'radius', { min: 0.5, max: 2, step: 0.05, label: 'spacing' }), rebuild);
    growthFolder.addBinding(params, 'stroke', { min: 0.1, max: 1, step: 0.01 });
    onInput(growthFolder.addBinding(params, 'warmup', { min: 0, max: 3000, step: 50 }), rebuild);
    growthFolder.addBinding(params, 'speed', { min: 0, max: 8, step: 1, label: 'steps / frame' });

    const colour = pane.addFolder({ title: 'Colour' });
    onInput(colour.addBinding(params, 'reverse', { label: 'slate' }), repaint);
    onInput(colour.addBinding(params, 'fill', { label: 'wash domain' }), repaint);
    onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
    onInput(colour.addBinding(params, 'hues', { min: 1, max: 6, step: 1 }), repaint);
    onInput(colour.addBinding(params, 'angle', { min: 1, max: 180, step: 1, label: 'hue Δ' }), repaint);
    onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
    onInput(
      colour.addBinding(params, 'ink', { min: 4.5, max: 18, step: 0.1, label: o.grill ? 'grill (:1)' : 'ink (:1)' }),
      repaint,
    );
    onInput(
      colour.addBinding(params, 'accent', { min: 1.2, max: 12, step: 0.1, label: o.grill ? 'fill (:1)' : 'walks (:1)' }),
      repaint,
    );
    onInput(colour.addBinding(params, 'wash', { min: 1.05, max: 3, step: 0.05, label: 'wash (:1)' }), repaint);
    colour.addButton({ title: 'New palette' }).on('click', () => {
      params.paletteSeed = Random.getRandomSeed();
      params.hue = Math.round(Random.range(0, 360));
      pane.refresh();
      repaint();
    });

    pane.addBinding(params, 'debug', { label: 'outlines' });

    build();
    paint();

    wrap.render = ({ width, height }: SketchProps) => {
      for (let i = 0; i < params.speed; i++) layout.step();

      const extent = params.grid * CELL;
      // Windowed: the field covers the opening's bounds and is clipped to it;
      // otherwise it sits centred in the canvas with a margin.
      const frame = o.windowed ? windowFrame(params.window, width, height) : undefined;
      const box = frame?.bounds;
      const scale = box ? Math.max(box.w, box.h) / extent : Math.min(width, height) * (0.88 / extent);
      const cx = box ? box.x + box.w / 2 : width / 2;
      const cy = box ? box.y + box.h / 2 : height / 2;
      const pitch = CELL / params.sub;
      const { growth, walks } = layout;

      context.fillStyle = colors.bg;
      context.fillRect(0, 0, width, height);
      frame?.back?.(context, colors.frame);

      context.save();
      if (frame) {
        context.clip(frame.aperture);
        // Repaint the ground over whatever the frame put behind the field.
        context.fillStyle = colors.bg;
        context.fillRect(0, 0, width, height);
      }
      context.translate(cx - (extent * scale) / 2, cy - (extent * scale) / 2);

      if (params.fill) {
        context.fillStyle = colors.wash;
        context.beginPath();
        for (const [x, y, w, h] of layout.rects) context.rect(x * scale, y * scale, w * scale, h * scale);
        context.fill();
      }

      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = growth.params.repulsionRadius * params.stroke * scale;

      // One path per walk colour; walks take the colours in turn.
      colors.walks.forEach((colour, c) => {
        context.strokeStyle = colour;
        context.beginPath();
        for (let w = c; w < walks.length; w += colors.walks.length) {
          walks[w].forEach(([x, y], i) => {
            const px = (x + 0.5) * pitch * scale;
            const py = (y + 0.5) * pitch * scale;
            if (i === 0) context.moveTo(px, py);
            // A lone node still gets a mark: a zero-length segment with round caps.
            if (i > 0 || walks[w].length === 1) context.lineTo(px, py);
          });
        }
        context.stroke();
      });

      context.strokeStyle = colors.ink;
      context.beginPath();
      growth.state.nodes.forEach((p, i) => {
        if (i === 0) context.moveTo(p.x * scale, p.y * scale);
        else context.lineTo(p.x * scale, p.y * scale);
      });
      context.closePath();
      context.stroke();

      if (o.grill) {
        const rc = params.knot * 0.17 * CELL * scale;
        const rd = params.knot * 0.19 * CELL * scale;
        // No knot on an edge: skip vertices on the grid's border, and any
        // the window would cut — all four extremes must sit in the aperture.
        const ox = cx - (extent * scale) / 2;
        const oy = cy - (extent * scale) / 2;
        const r = Math.max(rc, rd);
        const knots = layout.knots.filter((k) => {
          if (k.x <= 0 || k.y <= 0 || k.x >= extent || k.y >= extent) return false;
          if (!frame) return true;
          const [x, y] = [ox + k.x * scale, oy + k.y * scale];
          return (
            frame.contains(x - r, y) &&
            frame.contains(x + r, y) &&
            frame.contains(x, y - r) &&
            frame.contains(x, y + r)
          );
        });

        // Bars along the domain's outline, running on under the frame, but
        // never along the field's border — those sides lie against the frame.
        // Knots go on top — circles and diamonds alternating by grid
        // position, as in khidki.
        const onBorder = (a: number, b: number) => a === b && (a <= 0 || a >= extent);
        const bars = new Path2D();
        for (const [x0, y0, x1, y1] of layout.edges) {
          if (onBorder(x0, x1) || onBorder(y0, y1)) continue;
          bars.moveTo(x0 * scale, y0 * scale);
          bars.lineTo(x1 * scale, y1 * scale);
        }
        context.lineWidth = params.bar * scale;
        // Square caps close the corners; the half-bar they overhang sits
        // under the knot.
        context.lineCap = 'square';
        context.lineJoin = 'miter';
        // Depth first: the bars stamped a pixel at a time up and to the
        // right, 45° as in khidki, so the shaded face meets the front exactly.
        const depth = params.bar * scale;
        const steps = Math.max(1, Math.ceil(depth));
        context.strokeStyle = colors.barShadow;
        for (let k = steps; k >= 1; k--) {
          context.save();
          context.translate((depth * k) / steps, (-depth * k) / steps);
          context.stroke(bars);
          context.restore();
        }
        context.strokeStyle = colors.bars;
        context.stroke(bars);

        context.fillStyle = colors.circles;
        context.beginPath();
        for (const k of knots) {
          if (!k.circle) continue;
          context.moveTo(k.x * scale + rc, k.y * scale);
          context.arc(k.x * scale, k.y * scale, rc, 0, Math.PI * 2);
        }
        context.fill();
        context.fillStyle = colors.diamonds;
        context.beginPath();
        for (const k of knots) {
          if (k.circle) continue;
          const [x, y] = [k.x * scale, k.y * scale];
          context.moveTo(x, y - rd);
          context.lineTo(x + rd, y);
          context.lineTo(x, y + rd);
          context.lineTo(x - rd, y);
          context.closePath();
        }
        context.fill();
      }

      if (params.debug) {
        context.strokeStyle = colors.hairline;
        context.lineWidth = 1;
        context.beginPath();
        for (const [x0, y0, x1, y1] of layout.edges) {
          context.moveTo(x0 * scale, y0 * scale);
          context.lineTo(x1 * scale, y1 * scale);
        }
        context.stroke();
      }

      context.restore();

      frame?.draw(context, colors.frame);
    };

    return () => pane.dispose();
  };
