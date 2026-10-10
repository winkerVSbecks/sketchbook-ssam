import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { cuspPalette } from '../../colors/cusphanger';
import { createShell, nodePainter, type Camera, type Pt, type SceneView } from '../../ui';

/**
 * Morley's trisector theorem: trisect the three angles of any triangle — the
 * trisectors adjacent to each side meet in a point, and those three points
 * always form an equilateral triangle.
 *
 * The construction cuts the triangle into seven triangles: three on the sides
 * (each side with its Morley point), three at the corners (each vertex with
 * the two Morley points its trisectors reach) and Morley's triangle in the
 * middle. Every one is hatched the way flatland-grid hatches its lattice:
 * `splits` lines fanned from two of its vertices to the opposite sides. Drag
 * the vertices; whatever the triangle does, the middle one stays equilateral.
 * `line` mode drops the hatching and shows the bare construction.
 */

type Pt2 = [number, number];
type Tri = [Pt2, Pt2, Pt2];

const palette = cuspPalette({ count: 2, ground: 'light' });
const clrs = {
  bg: palette.bg.css,
  lines: palette.tiers.high[0].css,
  morley: palette.tiers.mid[1].css,
};
const HANDLE_FILL = `rgb(from ${clrs.lines} r g b / 0.35)`;
const HANDLE_RADIUS = 18;

// --- Geometry -----------------------------------------------------------------

const sub = (a: Pt2, b: Pt2): Pt2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Pt2, b: Pt2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Pt2, b: Pt2) => a[0] * b[0] + a[1] * b[1];
const rotate = ([x, y]: Pt2, t: number): Pt2 => [
  x * Math.cos(t) - y * Math.sin(t),
  x * Math.sin(t) + y * Math.cos(t),
];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt2, b: Pt2, t: number): Pt2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const linspace = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => (n <= 1 ? 0 : i / (n - 1)));

/** Interior angle at `p` between the rays to `q` and `r`. */
const angleAt = (p: Pt2, q: Pt2, r: Pt2) => {
  const u = sub(q, p);
  const v = sub(r, p);
  return Math.atan2(Math.abs(cross(u, v)), dot(u, v));
};

/**
 * The trisector at `p` lying next to side `p→q`: the direction of that side,
 * turned a third of the interior angle toward the third vertex `r`. The sign
 * of the turn comes from the winding, so it works for either orientation.
 */
const trisector = (p: Pt2, q: Pt2, r: Pt2): Pt2 => {
  const side = sub(q, p);
  const turn = (angleAt(p, q, r) / 3) * Math.sign(cross(side, sub(r, p)) || 1);
  return rotate(side, turn);
};

/** Intersection of the lines `p + s·d` and `q + t·e`. */
const meet = (p: Pt2, d: Pt2, q: Pt2, e: Pt2): Pt2 => {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return lerpPt(p, q, 0.5);
  const s = cross(sub(q, p), e) / den;
  return [p[0] + d[0] * s, p[1] + d[1] * s];
};

/** The Morley point on side `b–c`: where the trisectors of b and c nearest that side meet. */
const morleyPoint = (a: Pt2, b: Pt2, c: Pt2): Pt2 =>
  meet(b, trisector(b, c, a), c, trisector(c, b, a));

interface Construction {
  /** Morley points opposite a, b, c. */
  p: Pt2;
  q: Pt2;
  r: Pt2;
  /** The seven triangles that tile the original. */
  sides: Tri[];
  corners: Tri[];
  morley: Tri;
}

const construct = (a: Pt2, b: Pt2, c: Pt2): Construction => {
  const p = morleyPoint(a, b, c);
  const q = morleyPoint(b, c, a);
  const r = morleyPoint(c, a, b);
  return {
    p,
    q,
    r,
    sides: [
      [b, c, p],
      [c, a, q],
      [a, b, r],
    ],
    corners: [
      [a, r, q],
      [b, p, r],
      [c, q, p],
    ],
    morley: [p, q, r],
  };
};

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

  // A scalene triangle (the theorem is only interesting where the triangle is
  // not already symmetric), kept clear of the parameter panel.
  const verts: Pt[] = [
    { x: 0.5, y: 1.3 },
    { x: 3.55, y: 1.5 },
    { x: 1.4, y: 3.85 },
  ];

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    background: clrs.bg,
    grid: { cols: 4, subdivisions: 6 },
    modes: [
      { id: 'dot', icon: 'dot' },
      { id: 'line', icon: 'line' },
    ],
    params: [
      { id: 'weight', label: 'weight', min: 0.5, max: 12, value: 2.5, step: 0.5, knobColor: clrs.lines },
      { id: 'splits', label: 'splits', min: 1, max: 24, value: 9, step: 1, knobColor: clrs.morley },
    ],
    handles: {
      points: () => verts,
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
      verts,
      repaint: () => props.render(),
    };
  }

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

  /** flatland-grid's hatch: the outline, then a fan from `a` to `b–c` and from `c` to `a–b`. */
  const hatchTriangle = (ctx: CanvasRenderingContext2D, cam: Camera, [a, b, c]: Tri, splits: number) => {
    strokeWorld(ctx, cam, [a, b, c], true);
    for (const t of linspace(splits)) strokeWorld(ctx, cam, [a, lerpPt(b, c, t)], false);
    for (const t of linspace(splits)) strokeWorld(ctx, cam, [c, lerpPt(a, b, t)], false);
  };

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const { weight, splits } = view.params;
    const k = view.magnification;
    const [a, b, c] = verts.map((v): Pt2 => [v.x, v.y]);
    const m = construct(a, b, c);
    const hatched = view.mode !== 'line';

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = weight * k;
    ctx.strokeStyle = clrs.lines;

    if (hatched) {
      for (const t of [...m.sides, ...m.corners]) hatchTriangle(ctx, cam, t, splits);
      // Morley's triangle: the same hatch, denser, in the accent.
      ctx.strokeStyle = clrs.morley;
      hatchTriangle(ctx, cam, m.morley, splits * 2);
    } else {
      strokeWorld(ctx, cam, [a, b, c], true);
      // The six trisectors, each from its vertex to the Morley point it reaches.
      for (const [v, t] of [
        [a, m.r],
        [a, m.q],
        [b, m.p],
        [b, m.r],
        [c, m.q],
        [c, m.p],
      ] as [Pt2, Pt2][]) {
        strokeWorld(ctx, cam, [v, t], false);
      }
      ctx.strokeStyle = clrs.morley;
      ctx.lineWidth = weight * 1.6 * k;
      strokeWorld(ctx, cam, m.morley, true);
    }

    if (view.magnified) {
      const node = nodePainter(HANDLE_RADIUS * k * 0.5);
      verts.forEach((p, i) => node(ctx, cam.worldToScreen(p), i, shell.handles?.active === i));
    }
  };

  wrap.render = () => shell.render(drawScene);
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
