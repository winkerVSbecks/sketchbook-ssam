import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { createShell, type Camera, type Pt, type SceneView } from '../../ui';
import { getState, type Pt2, type Tri } from './napoleon-geometry';

/**
 * Napoleon's theorem: erect an equilateral triangle on each side of any
 * triangle — the centroids of those three form another equilateral triangle.
 * Ported from a canvas-sketch piece; the vertices are draggable handles here.
 */

const clrs = {
  bg: '#fff',
  stroke: '#333', // triangle + erected triangles
  fill: 'rgba(102, 102, 102, 0.1)', // their fill in filled mode
  centroidTriangle: '#01FF70', // Napoleon's triangle: stroke in line mode, fill in filled mode
  handle: '#a463f2', // knob colour; drawn handles use HANDLE_FILL
};
/** Translucent handle fill derived from the handle colour (CSS relative colour syntax). */
const HANDLE_FILL = `rgb(from ${clrs.handle} r g b / 0.55)`;

// --- Sketch -------------------------------------------------------------------

export const sketch = ({
  wrap,
  context,
  canvas,
  width,
  height,
  pixelRatio,
  ...props
}: SketchProps) => {
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

  // Vertices in world units, draggable. The original's u=(270,540) v=(405,270)
  // w=(810,540) on a 1080 px canvas map as x → 4 − x/270, y → 4 − y/270: x is
  // mirrored because `xOrigin: 'right'` makes world x grow leftward, y because
  // the original was y-down — so the orientation-dependent apex() erects the
  // equilateral triangles outward like the original piece.
  const verts: Pt[] = [
    { x: 3, y: 2 },
    { x: 2.5, y: 3 },
    { x: 1, y: 2 },
  ];

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    background: clrs.bg,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    modes: [
      { id: 'line', icon: 'line' },
      { id: 'dot', icon: 'dot' },
    ],
    params: [
      { id: 'weight', label: 'Weight', min: 1, max: 20, value: 6, step: 0.5 },
      {
        id: 'handle',
        label: 'Handle',
        min: 6,
        max: 60,
        value: 27,
        step: 1,
        knobColor: clrs.handle,
      },
    ],
    // Vertices are shell handles: hit-tested and painted above the scene
    handles: {
      points: () => verts,
      onDrag: (i, p) => {
        verts[i] = p;
      },
      radius: 30,
      draw: (ctx, s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, shell.params.value('handle'), 0, Math.PI * 2);
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

  const tuple = (p: Pt): Pt2 => [p.x, p.y];

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

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    view: SceneView,
  ) => {
    const { weight } = view.params;
    const k = view.magnification;
    const state = getState(tuple(verts[0]), tuple(verts[1]), tuple(verts[2]));
    const filled = view.mode === 'dot';

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = weight * k;

    // Triangle + erected triangles: #333 strokes, #444 fill in filled mode.
    // Napoleon's triangle keeps its green: stroke in line mode, fill (under a
    // #333 stroke) in filled mode. Fills are hatched inside the loupe.
    const paint = (fill: string, stroke: string) => {
      if (filled) {
        ctx.fillStyle = view.magnified ? shell.hatch(fill) : fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };
    for (const t of [state.a, state.b, state.c, state.triangle]) {
      tri(ctx, cam, t);
      paint(clrs.fill, clrs.stroke);
    }
    tri(ctx, cam, state.centroidTriangle);
    paint(clrs.centroidTriangle, clrs.centroidTriangle);

    // Inside the loupe the handles are drawn magnified, on top of the triangles;
    // outside, the shell's handle layer paints them above the scene.
    if (view.magnified) {
      const { handle } = view.params;
      for (const p of verts) {
        const s = cam.worldToScreen(p);
        ctx.beginPath();
        ctx.arc(s.x, s.y, handle * k, 0, Math.PI * 2);
        ctx.fillStyle = HANDLE_FILL;
        ctx.fill();
      }
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
