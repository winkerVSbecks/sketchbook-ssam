import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { createShell, theme, type Camera, type SceneView } from '../../ui';

const KNOB = { weight: '#111111', outside: '#e8541e', inside: '#8a5cf5' };

/** Rounded polygon: `outer` radius rounds convex corners, `inner` rounds the concave ones. */
function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  points: number,
  outer: number,
  inner: number,
) {
  const pts: { x: number; y: number; convex: boolean }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const convex = i % 2 === 0;
    const rr = convex ? r : r * 0.55;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, convex });
  }
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const rad = p.convex ? outer : inner;
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y);
    const d2 = Math.hypot(next.x - p.x, next.y - p.y);
    const t = Math.min(rad, d1 / 2, d2 / 2);
    const ax = p.x + ((prev.x - p.x) / d1) * t;
    const ay = p.y + ((prev.y - p.y) / d1) * t;
    const bx = p.x + ((next.x - p.x) / d2) * t;
    const by = p.y + ((next.y - p.y) / d2) * t;
    if (i === 0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(p.x, p.y, bx, by);
  }
  ctx.closePath();
  return pts;
}

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

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    modes: [
      { id: 'dot', icon: 'dot' },
      { id: 'ring', icon: 'ring' },
      { id: 'line', icon: 'line' },
    ],
    params: [
      {
        id: 'weight',
        label: 'Weight',
        min: 1,
        max: 100,
        step: 0.5,
        value: 24,
        knobColor: KNOB.weight,
      },
      {
        id: 'outside',
        label: 'Outside corners',
        min: 0,
        max: 120,
        step: 1,
        value: 0,
        knobColor: KNOB.outside,
      },
      {
        id: 'inside',
        label: 'Inside corners',
        min: 0,
        max: 120,
        step: 1,
        value: 0,
        knobColor: KNOB.inside,
      },
    ],
    onChange: () => props.render(),
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      shell,
      camera: shell.camera,
      loupe: shell.loupe,
      repaint: () => props.render(),
    };
  }

  // The subject lives in world space (1 unit = 1 base cell); pixel-valued params
  // are converted with `shell.px` so they read true at the fit view.
  const drawScene = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    view: SceneView,
  ) => {
    const { weight, outside, inside } = view.params;
    const px = shell.px;
    const c = shell.camera.fitCenter;

    // Build the path in world space, then paint in screen space so strokes and
    // patterns stay crisp at any magnification.
    ctx.save();
    cam.apply(ctx);
    const pts = starPath(ctx, c.x, c.y, 1.2, 5, outside * px, inside * px);
    ctx.restore();
    ctx.lineJoin = 'round';

    if (view.mode === 'dot') {
      ctx.fillStyle = view.magnified ? shell.hatch(KNOB.inside) : KNOB.inside;
      ctx.fill();
      ctx.lineWidth = view.magnified ? 2 : weight;
      ctx.strokeStyle = view.magnified ? theme.ink : KNOB.inside;
      ctx.stroke();
    } else if (view.mode === 'ring') {
      ctx.lineWidth = weight * view.magnification;
      ctx.strokeStyle = KNOB.inside;
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.ink;
      ctx.stroke();
    }

    // Control nodes at the vertices: always inside the loupe, wireframe mode outside
    if (view.magnified || view.mode === 'line') {
      ctx.lineWidth = view.magnified ? 2 : 1.5;
      ctx.strokeStyle = theme.ink;
      for (const p of pts) {
        const sp = cam.worldToScreen(p);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, view.magnified ? 7 : 6, 0, Math.PI * 2);
        ctx.fillStyle = theme.paper;
        ctx.fill();
        ctx.stroke();
      }
    }
  };

  wrap.render = () => shell.render(drawScene);
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
