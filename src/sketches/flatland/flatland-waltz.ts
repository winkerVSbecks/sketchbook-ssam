import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';

import { createShell, theme, type Camera, type Pt, type SceneView } from '../../ui';
import { getState, type Pt2, type Tri } from './napoleon-geometry';

/**
 * Flatland waltz: Napoleon's construction on a triangle whose vertices wander
 * on a looping noise path, with the gaps between the erected triangles and the
 * canvas corners fanned out in colour. Ported from a canvas-sketch piece; here
 * the vertices are draggable handles that set each vertex's base position, and
 * the `drift` slider scales the original noise wander (0 = static).
 */

const clrs = {
  bg: '#1B2280',
  triangle: '#1B2280',
  centroidTriangle: '#2151B7',
  edgeTriangles: ['#E23122', '#F5C644', '#9B2153'],
  handle: '#FF851B',
};
/** Translucent handle fill derived from the handle colour (CSS relative colour syntax). */
const HANDLE_FILL = `rgb(from ${clrs.handle} r g b / 0.55)`;
const HANDLE_RADIUS = 27; // screen px, as the original

/**
 * The original 1080 px canvas spans the 4-unit grid. With `xOrigin: 'right'`
 * world x grows leftward, so original x → 4 − x/270 keeps the composition
 * reading the same way round (u left, w right, v upper-left); y is mirrored
 * because the original was y-down.
 */
const PX = 270;
const UNITS = 4;

// --- Noise wander (ported; noise is sampled in the original's pixel space so the
// path is identical, only its output is scaled to world units) -------------------

interface Wander {
  /** Noise circle centre, world units. */
  cx: number;
  cy: number;
  offset: number;
}

function loopNoise({ cx, cy, offset }: Wander, range: number, playhead: number) {
  const radius = UNITS * PX; // the original used `width`
  const v: number = Random.noise2D(
    (cx * PX + radius * Math.cos(Math.PI * 2 * playhead) + offset) / 1000,
    (cy * PX + radius * Math.sin(Math.PI * 2 * playhead) + offset) / 1000,
    2,
    1,
  );
  return mapRange(v, -1, 1, 0, range) as number;
}

/** Polar wander offset for one vertex; `r` spans one grid unit (the original's width/4). */
function wanderOffset(w: Wander, playhead: number): Pt2 {
  const r = loopNoise({ ...w, offset: w.offset + 0 }, 1, playhead);
  const theta = loopNoise({ ...w, offset: w.offset + 1000 }, 2 * Math.PI, playhead);
  // Both axes are mirrored relative to the original's y-down, x-rightward canvas
  return [-r * Math.cos(theta), -r * Math.sin(theta)];
}

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

  Random.setSeed('napoleon-theorem');

  // Base vertices in world units (the original's u/v/w: x → 4 − x/270, y → 4 − y/270), draggable
  const verts: Pt[] = [
    { x: 3, y: 2 },
    { x: 2.5, y: 3 },
    { x: 1, y: 2 },
  ];
  // The original's noise circle centres (px ÷ 270) and per-vertex offsets
  const wanders: Wander[] = [
    { cx: 1, cy: 2, offset: 0 },
    { cx: 1.5, cy: 1, offset: 1000 },
    { cx: 3, cy: 2, offset: 2000 },
  ];

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    modes: [{ id: 'dot', icon: 'dot' }, { id: 'line', icon: 'line' }],
    params: [
      { id: 'weight', label: 'Weight', min: 0, max: 12, value: 0, step: 0.5, knobColor: '#111111' },
      { id: 'drift', label: 'Drift', min: 0, max: 1, value: 0, step: 0.01, knobColor: '#e8541e' },
    ],
    loupe: {},
    // Vertices are shell handles: hit-tested where the disc is painted (the base point)
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
      camera: shell.camera,
      loupe: shell.loupe,
      verts,
      repaint: () => props.render(),
    };
  }

  // The grid area's world rect at the fit view: 4 units across, slightly taller
  // (inner.h / fitScale). The original's canvas corners map onto it so the fan
  // fills the whole area; x is mirrored, so the original's TL (0,0) is [W, H].
  const W = shell.camera.units;
  const H = shell.inner.h / shell.camera.fitScale;
  const TL: Pt2 = [W, H];
  const TR: Pt2 = [0, H];
  const BR: Pt2 = [0, 0];
  const BL: Pt2 = [W, 0];

  let playhead = 0;

  /** Drawn vertices: base handle + drift × the noise wander. */
  const drifted = (drift: number): [Pt2, Pt2, Pt2] =>
    verts.map((p, i) => {
      if (drift === 0) return [p.x, p.y] as Pt2;
      const [dx, dy] = wanderOffset(wanders[i], playhead);
      return [p.x + drift * dx, p.y + drift * dy] as Pt2;
    }) as [Pt2, Pt2, Pt2];

  // Build a triangle path in world space, then paint in screen space
  const tri = (ctx: CanvasRenderingContext2D, cam: Camera, t: Tri) => {
    ctx.save();
    cam.apply(ctx);
    ctx.beginPath();
    ctx.moveTo(...t[0]);
    ctx.lineTo(...t[1]);
    ctx.lineTo(...t[2]);
    ctx.closePath();
    ctx.restore();
  };

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const { weight, drift } = view.params;
    const k = view.magnification;
    const filled = view.mode !== 'line';
    const [u, v, w] = drifted(drift);
    const { triangle, a, b, c, centroidTriangle } = getState(u, v, w);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Ground inside the grid (filled mode only; the line mode sits on the paper)
    if (filled) {
      const r = cam.visibleWorld();
      ctx.save();
      cam.apply(ctx);
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.restore();
      ctx.fillStyle = view.magnified ? shell.hatch(clrs.bg) : clrs.bg;
      ctx.fill();
    }

    // Same order and colours as the original: nine fan triangles to the corners,
    // the white sliver, then the three erected triangles, the triangle and
    // Napoleon's triangle. Fills are hatched inside the loupe.
    const fan: [Tri, string][] = [
      [[TL, a[1], a[2]], '#F2A5A3'],
      [[TL, a[2], b[1]], '#EC572A'],
      [[TL, b[1], TR], '#D1E2F6'],
      [[TR, b[1], b[2]], '#807CC7'],
      [[TR, b[2], BR], '#E33123'],
      [[b[2], BR, c[1]], '#E47590'],
      [[BR, c[1], BL], '#E33222'],
      [[BL, c[1], c[2]], '#4FADEC'],
      [[BL, c[2], TL], '#F6C644'],
      [[TL, a[1], a[0]], '#FFFFFF'],
      [a, clrs.edgeTriangles[0]],
      [b, clrs.edgeTriangles[1]],
      [c, clrs.edgeTriangles[2]],
      [triangle, clrs.triangle],
      [centroidTriangle, clrs.centroidTriangle],
    ];
    for (const [t, color] of fan) {
      tri(ctx, cam, t);
      if (filled) {
        ctx.fillStyle = view.magnified ? shell.hatch(color) : color;
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(weight, 1) * k;
        ctx.strokeStyle = theme.ink;
        ctx.stroke();
      }
    }

    // Inside the loupe: a hairline joins each base handle to its drifted vertex,
    // and the handles are drawn magnified on top (outside, the shell paints them).
    if (view.magnified) {
      const drawn = [u, v, w];
      verts.forEach((p, i) => {
        const s = cam.worldToScreen(p);
        if (drift > 0) {
          const d = cam.worldToScreen({ x: drawn[i][0], y: drawn[i][1] });
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(d.x, d.y);
          ctx.lineWidth = 1;
          ctx.strokeStyle = filled ? clrs.handle : theme.ink;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, HANDLE_RADIUS * k, 0, Math.PI * 2);
        ctx.fillStyle = HANDLE_FILL;
        ctx.fill();
      });
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
