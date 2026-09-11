import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import {
  attachPointer,
  contains,
  createCamera,
  createLoupe,
  createRangeGroup,
  createToggleGroup,
  createUI,
  createWindow,
  drawGridLines,
  drawGridMarkers,
  gridMarkersInnerRect,
  gridStep,
  icons,
  labelFont,
  theme,
} from '../../ui';

type Tool = 'dot' | 'ring' | 'line';

const KNOB = { weight: '#111111', outside: '#e8541e', inside: '#8a5cf5' };
const BG = '#f6f6f5';

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

/** Dot-hatched fill for the magnified shape: a small tile of ink dots over the colour. */
function makeHatchPattern(ctx: CanvasRenderingContext2D, color: string, pixelRatio: number): CanvasPattern | string {
  const tile = 6;
  const c = document.createElement('canvas');
  c.width = c.height = tile * pixelRatio;
  const t = c.getContext('2d');
  if (!t) return color;
  t.scale(pixelRatio, pixelRatio);
  t.fillStyle = color;
  t.fillRect(0, 0, tile, tile);
  t.fillStyle = 'rgba(17, 17, 17, 0.55)';
  t.beginPath();
  t.arc(tile / 2, tile / 2, 0.9, 0, Math.PI * 2);
  t.fill();
  const pattern = ctx.createPattern(c, 'repeat');
  if (!pattern) return color;
  pattern.setTransform(new DOMMatrix().scale(1 / pixelRatio));
  return pattern;
}

export const sketch = ({ wrap, context, canvas, width, height, pixelRatio, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const repaint = () => props.render();

  // --- Controls -----------------------------------------------------------
  // Render mode (radio) and the magnifier (independent on/off) share one toolbar window
  const tools = createToggleGroup({
    items: [
      { id: 'dot', drawIcon: icons.dot },
      { id: 'ring', drawIcon: icons.ring },
      { id: 'line', drawIcon: icons.line },
    ],
    exclusive: true,
    active: 'dot',
  });
  const magnifier = createToggleGroup({
    items: [{ id: 'zoom', drawIcon: icons.zoom }],
    exclusive: false,
    onChange: (active) => {
      if (active.includes('zoom')) {
        // Show at the last position, or the grid centre if never placed
        if (!loupe.center) loupe.placeAt({ x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 });
        else loupe.visible = true;
      } else loupe.hide();
    },
  });

  const ranges = createRangeGroup({
    ranges: [
      { id: 'weight', label: 'Weight', min: 1, max: 100, step: 0.5, value: 24, knobColor: KNOB.weight },
      { id: 'outside', label: 'Outside corners', min: 0, max: 120, step: 1, value: 0, knobColor: KNOB.outside },
      { id: 'inside', label: 'Inside corners', min: 0, max: 120, step: 1, value: 0, knobColor: KNOB.inside },
    ],
  });

  // Window width = button + window padding (12 each side); toggle groups have no cell frame
  const toolbar = createWindow({
    x: 52,
    y: 56,
    width: 64 + 12 * 2,
    children: [tools, magnifier],
  });

  const panel = createWindow({
    x: width / 2 - 130,
    y: height - 320,
    width: 260,
    children: ranges.controls,
  });

  // --- Grid + camera (fixed at the fit view) --------------------------------
  const grid = {
    width,
    height,
    margin: 44,
    cols: 4,
    rows: 4,
    subdivisions: 6,
    xOrigin: 'right' as const,
  };
  const inner = gridMarkersInnerRect(grid);
  const camera = createCamera({
    viewport: inner,
    units: grid.cols,
    flipX: grid.xOrigin === 'right',
    flipY: true, // y grows upward, like the type-design reference
  });
  const size = (): [number, number] => [width, height];
  const px = 1 / camera.fitScale; // world units per screen pixel at the fit view

  // --- Loupe ----------------------------------------------------------------
  const hatch = makeHatchPattern(context, KNOB.inside, pixelRatio);
  const loupe = createLoupe({
    camera,
    size: [width, height],
    render: (c, lens, info) => {
      const v = ranges.values();
      drawGridLines(c, lens, { step: gridStep(camera.zoom), subdivisions: grid.subdivisions, area: lens.viewport });
      // Star: build the path in world space, then fill/stroke in screen space so the hatch stays crisp
      c.save();
      lens.apply(c);
      const pts = starPath(c, camera.fitCenter.x, camera.fitCenter.y, 1.2, 5, v.outside * px, v.inside * px);
      c.restore();
      c.lineJoin = 'round';
      const mode = tools.active[0] as Tool;
      if (mode === 'dot') {
        c.fillStyle = hatch;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = theme.ink;
        c.stroke();
      } else if (mode === 'ring') {
        c.lineWidth = v.weight * info.magnification;
        c.strokeStyle = KNOB.inside;
        c.stroke();
      } else {
        c.lineWidth = 1.5;
        c.strokeStyle = theme.ink;
        c.stroke();
      }
      c.lineWidth = 2;
      c.strokeStyle = theme.ink;
      // Control nodes at the vertices
      for (const p of pts) {
        const sp = lens.worldToScreen(p);
        c.beginPath();
        c.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
        c.fillStyle = theme.paper;
        c.fill();
        c.stroke();
      }
    },
  });

  const ui = createUI();
  ui.add(loupe, toolbar, panel); // loupe first so windows stay above it

  const disposePointer = attachPointer(canvas, ui, size, {
    onChange: repaint,
    // While the magnifier is on, a click on the grid re-places the loupe centred at the point
    onMiss: (pt) => {
      if (!loupe.visible || !contains(inner, pt)) return false;
      return loupe.placeAt(pt);
    },
  });
  const disposeWheel = loupe.attachWheel(canvas, size, repaint);
  const dispose = () => {
    disposePointer();
    disposeWheel();
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = { camera, loupe, repaint };
  }

  // `h` brings hidden windows back, Escape hides the loupe
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'h') {
      toolbar.show();
      panel.show();
      repaint();
    }
    if (e.key === 'Escape' && loupe.hide()) {
      magnifier.setActive('zoom', false);
      repaint();
    }
  };
  window.addEventListener('keydown', onKey);
  import.meta.hot?.dispose(() => window.removeEventListener('keydown', onKey));

  // --- Render -------------------------------------------------------------
  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = BG;
    context.fillRect(0, 0, width, height);

    drawGridMarkers(context, { ...grid, camera, paper: BG });

    const v = ranges.values();
    const tool = tools.active[0] as Tool;

    // Subject lives in world space: 1 unit = 1 base cell; pixel-valued controls
    // are converted with `px` so they read true at the fit view.
    context.save();
    context.beginPath();
    context.rect(inner.x, inner.y, inner.w, inner.h);
    context.clip();
    camera.apply(context);
    const c = camera.fitCenter;
    const pts = starPath(context, c.x, c.y, 1.2, 5, v.outside * px, v.inside * px);
    context.lineJoin = 'round';
    context.lineWidth = v.weight * px;
    context.strokeStyle = KNOB.inside;
    context.fillStyle = KNOB.inside;
    if (tool === 'dot') {
      context.fill();
      context.stroke();
    } else if (tool === 'ring') {
      context.stroke();
    } else {
      context.lineWidth = 1.5 * px;
      context.strokeStyle = theme.ink;
      context.stroke();
      for (const p of pts) {
        context.beginPath();
        context.arc(p.x, p.y, 6 * px, 0, Math.PI * 2);
        context.fillStyle = theme.paper;
        context.fill();
        context.stroke();
      }
    }
    context.restore();

    // Tabular readout, top-right of the drawing area
    context.save();
    context.font = labelFont(13, 500);
    context.fillStyle = theme.ink;
    context.textBaseline = 'top';
    const rx = inner.x + inner.w - 24;
    const ry = inner.y + 28;
    const rows: [string, number][] = [
      ['WEIGHT', v.weight],
      ['OUTSIDE', v.outside],
      ['INSIDE', v.inside],
    ];
    if (loupe.visible) rows.push(['LOUPE', loupe.magnification]);
    rows.forEach(([k, n], i) => {
      context.textAlign = 'right';
      context.fillText(`:${n.toFixed(2).padStart(6, '0')}`, rx, ry + i * 18);
      context.fillText(k, rx - 64, ry + i * 18);
    });
    context.restore();

    ui.draw(context);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
