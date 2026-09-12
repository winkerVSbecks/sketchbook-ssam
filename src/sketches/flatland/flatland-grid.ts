import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { createShell, nodePainter, type Camera, type Pt, type SceneView } from '../../ui';
import { getState, type Pt2, type Tri } from './napoleon-geometry';

/**
 * Flatland grid: Napoleon's construction fanned out to the four corners of the
 * grid, every triangle hatched with `splits` lines from two of its vertices.
 * Ported from a canvas-sketch piece; the vertices are draggable handles here
 * and the original noise wander is dialled in with the `drift` slider.
 */

const clrs = {
  bg: '#F1F2EE',
  lines: '#1B2280',
};
/** Translucent handle fill derived from the line colour (CSS relative colour syntax). */
const HANDLE_FILL = `rgb(from ${clrs.lines} r g b / 0.4)`;
const HANDLE_RADIUS = 18;

// Original canvas: 1080 px → 4 world units
const PX = 1080;
const UNITS = 4;
const toUnits = (px: number) => (px / PX) * UNITS;

// --- Noise wander (ported from the source, in world units) ------------------------

Random.setSeed('flatland-grid');

interface Wander {
  cx: number;
  cy: number;
  offset: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpArray = (a: Pt2, b: Pt2, t: number): Pt2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const linspace = (n: number): number[] => Array.from({ length: n }, (_, i) => (n <= 1 ? 0 : i / (n - 1)));

/** Sample 2D noise around a circle so the value loops with the playhead, mapped to 0..range. */
const loopNoise = ({ cx, cy, offset }: Wander, range: number, playhead: number) => {
  const radius = PX;
  const v = Random.noise2D(
    (cx + radius * Math.cos(Math.PI * 2 * playhead) + offset) / 1000,
    (cy + radius * Math.sin(Math.PI * 2 * playhead) + offset) / 1000,
    1,
    1,
  ) as number;
  return lerp(0, range, (v + 1) / 2);
};

/** Polar wander around a base point: radius up to 1 unit (the original's width/4). */
const wanderOffset = (w: Wander, playhead: number): Pt2 => {
  const r = loopNoise({ ...w, offset: w.offset + 0 }, 1, playhead);
  const theta = loopNoise({ ...w, offset: w.offset + 1000 }, 2 * Math.PI, playhead);
  return [r * Math.cos(theta), r * Math.sin(theta)];
};

// Noise circle centres from the original (px, y-down), in the same order as the vertices
const wanders: Wander[] = [
  { cx: 270, cy: 540, offset: 0 },
  { cx: 405, cy: 270, offset: 1000 },
  { cx: 810, cy: 540, offset: 2000 },
];

// --- Sketch -------------------------------------------------------------------

export const sketch = ({ wrap, context, canvas, width, height, pixelRatio, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      shell.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // Base vertices in world units (original px ÷ 270, y mirrored), draggable
  const verts: Pt[] = [
    { x: toUnits(270), y: toUnits(PX - 540) },
    { x: toUnits(540), y: toUnits(PX - 270) },
    { x: toUnits(810), y: toUnits(PX - 540) },
  ];

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    // Both modes draw the same lattice; only `line` shows (and lets you drag) the vertices
    modes: [
      { id: 'dot', icon: 'dot' },
      { id: 'line', icon: 'line' },
    ],
    params: [
      { id: 'weight', label: 'weight', min: 0.5, max: 20, value: 6, step: 0.5, knobColor: '#1B2280' },
      { id: 'splits', label: 'splits', min: 1, max: 16, value: 6, step: 1, knobColor: '#e8541e' },
      { id: 'drift', label: 'drift', min: 0, max: 1, value: 0, step: 0.01, knobColor: '#e8541e' },
    ],
    loupe: {},
    // The handles are the base vertices; the drawn vertex = base + drift × wander.
    // Hidden and inert in `dot` mode (no points to hit-test or paint).
    handles: {
      points: () => (shell.mode === 'line' ? verts : []),
      onDrag: (i, p) => {
        verts[i] = p;
      },
      radius: 30,
      draw: (ctx, s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = HANDLE_FILL;
        ctx.fill();
      },
    },
    onChange: () => props.render(),
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      shell,
      camera: shell.camera,
      loupe: shell.loupe,
      verts,
      repaint: () => props.render(),
    };
  }

  let playhead = 0;

  const drifted = (i: number, drift: number): Pt2 => {
    const base = verts[i];
    if (drift === 0) return [base.x, base.y];
    const [dx, dy] = wanderOffset(wanders[i], playhead);
    // The original wanders in y-down px space; world y is up, so mirror dy
    return [base.x + drift * dx, base.y - drift * dy];
  };

  // Grid corners inset by the original's 3 px margin (in world units), y up
  const corners = () => {
    const m = 3 * shell.px;
    const h = shell.camera.fitCenter.y * 2;
    return {
      tl: [m, h - m] as Pt2,
      tr: [UNITS - m, h - m] as Pt2,
      br: [UNITS - m, m] as Pt2,
      bl: [m, m] as Pt2,
    };
  };

  // Build a polyline path in world space, then stroke in screen space
  const strokeWorld = (ctx: CanvasRenderingContext2D, cam: Camera, pts: Pt2[], close: boolean) => {
    ctx.save();
    cam.apply(ctx);
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]);
    if (close) ctx.closePath();
    ctx.restore();
    ctx.stroke();
  };

  const drawTriangle = (ctx: CanvasRenderingContext2D, cam: Camera, [a, b, c]: Tri, splits: number) => {
    strokeWorld(ctx, cam, [a, b, c], true);
    for (const t of linspace(splits)) strokeWorld(ctx, cam, [a, lerpArray(b, c, t)], false);
    for (const t of linspace(splits)) strokeWorld(ctx, cam, [c, lerpArray(a, b, t)], false);
  };

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const { weight, splits, drift } = view.params;
    const k = view.magnification;

    // Coloured ground over the visible world
    const vw = cam.visibleWorld();
    ctx.save();
    cam.apply(ctx);
    ctx.beginPath();
    ctx.rect(vw.x, vw.y, vw.w, vw.h);
    ctx.restore();
    ctx.fillStyle = clrs.bg;
    ctx.fill();

    const u = drifted(0, drift);
    const v = drifted(1, drift);
    const w = drifted(2, drift);
    const { triangle, a, b, c } = getState(u, v, w);
    const { tl, tr, br, bl } = corners();

    // The original's fan, with y-down corners mapped to y-up:
    // (margin, margin) → tl, (width-margin, margin) → tr,
    // (width-margin, height-margin) → br, (margin, height-margin) → bl
    const triangles: Tri[] = [
      [tl, a[1], a[2]],
      [tl, a[2], b[1]],
      [tl, b[1], tr],
      [tr, b[1], b[2]],
      [tr, b[2], br],
      [b[2], br, c[1]],
      [br, c[1], bl],
      [bl, c[1], c[2]],
      [bl, c[2], tl],
      [tl, a[1], a[0]],
      a,
      b,
      c,
      triangle,
    ];

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = weight * k;
    ctx.strokeStyle = clrs.lines;
    for (const t of triangles) drawTriangle(ctx, cam, t, splits);

    // Inside the loupe, in `line` mode only: a hairline from each base handle to
    // its drifted vertex, and the handles as magnified nodes on top.
    if (view.magnified && view.mode === 'line') {
      if (drift > 0) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = clrs.lines;
        [u, v, w].forEach((p, i) => strokeWorld(ctx, cam, [[verts[i].x, verts[i].y], p], false));
      }
      const node = nodePainter(HANDLE_RADIUS * k * 0.5);
      verts.forEach((p, i) => node(ctx, cam.worldToScreen(p), i, shell.handles?.active === i));
    }
  };

  wrap.render = (p: SketchProps) => {
    playhead = p?.playhead ?? playhead;
    shell.render(drawScene);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 24_000,
};

ssam(sketch as Sketch<'2d'>, settings);
