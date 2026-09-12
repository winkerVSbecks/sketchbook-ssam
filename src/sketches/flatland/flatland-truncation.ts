import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { palettes } from '../../colors/mindful-palettes';
import { createShell, type Camera, type SceneView } from '../../ui';
import type { Pt2 } from './napoleon-geometry';

/**
 * Flatland — truncation. A regular polygon whose vertices slide towards the
 * midpoints of their edges, cutting the corners off. Ported from a looping
 * canvas-sketch piece; here it is static and every value the noise used to
 * drive is a slider. The polygon sits directly on the shell's paper — no
 * coloured ground — and takes its two colours from a Mindful palette: colour
 * [0] for the base polygon, colour [1] for the truncated one.
 */

// --- Geometry (world units) -----------------------------------------------------
// The shell's grid has its x-origin on the right and y-origin at the bottom, so
// world x grows leftward and world y upward — both axes of the original's
// screen-space (x right, y down) are mirrored here so the piece reads the same.

const rad = (a: number) => (Math.PI * a) / 180;

/** Polar → cartesian; the original's `[cx - r·cos, cy - r·sin]` with both axes mirrored. */
const polarToCart = (r: number, a: number, [cx, cy]: Pt2): Pt2 => [
  cx + r * Math.cos(rad(a)),
  cy + r * Math.sin(rad(a)),
];

/**
 * Integers 0 ≤ i < n, like Ramda's `range`. A fractional `n` therefore yields
 * `ceil(n)` vertices spaced by 360/n — the original's off-kilter, non-closing
 * polygons — and that quirk is kept on purpose.
 */
const range = (n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i);
  return out;
};

const generatePolygon = (vertexCount: number, r: number, center: Pt2, rotation: number): Pt2[] => {
  const theta = 360 / vertexCount;
  return range(vertexCount).map((i) => polarToCart(r, theta * i + rotation, center));
};

const midpoint = (u: Pt2, v: Pt2): Pt2 => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
const lerp = (start: number, stop: number, amt: number) => amt * (stop - start) + start;

const generateMidpoints = (vertices: Pt2[]): Pt2[] =>
  vertices.map((vertex, idx) => midpoint(vertex, vertices[(idx + 1) % vertices.length]));

/** Each vertex twice, paired with the midpoint of the edge before and after it. */
const generateSplitVertices = (vertices: Pt2[], _mps: Pt2[]): [Pt2, Pt2][] => {
  const duplicate = <T>(xs: T[]): T[] => xs.flatMap((x) => [x, x]);
  const splitVertices = duplicate(vertices);
  const mps = duplicate(_mps);

  return splitVertices.map((vertex, idx) => {
    if (idx === 0) return [vertex, mps[mps.length - 1]];
    if (idx === 1) return [vertex, mps[0]];
    if (idx % 2 === 0) return [vertex, mps[idx - 1]];
    return [vertex, mps[idx]];
  });
};

const truncatePolygon = (splitVertices: [Pt2, Pt2][], scale: number): Pt2[] =>
  splitVertices.map(([v, mp]) => [lerp(v[0], mp[0], scale), lerp(v[1], mp[1], scale)]);

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

  // The shell draws the grid rulers, toolbar, parameter window and loupe, and
  // wires pointer, gestures (wheel pans, ⌃-wheel / pinch zooms) and keyboard:
  // `h` restores closed windows, `r` resets the view, `Esc` hides the loupe.
  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    modes: [],
    params: [
      { id: 'vertices', label: 'vertices', min: 2, max: 12, value: 3, step: 0.1, knobColor: '#188F5C' },
      { id: 'truncation', label: 'truncation', min: 0, max: 2, value: 0.5, step: 0.01, knobColor: '#f17447' },
      { id: 'radius', label: 'radius', min: 0.2, max: 2, value: 1, step: 0.05, knobColor: '#FCBE31' },
      { id: 'rotation', label: 'rotation', min: 0, max: 360, value: 0, step: 1, knobColor: '#111111' },
      { id: 'weight', label: 'weight', min: 0, max: 200, value: 144, step: 1, knobColor: '#8a5cf5' },
      { id: 'palette', label: 'palette', min: 0, max: palettes.length - 1, value: 0, step: 1, knobColor: '#111111' },
    ],
    loupe: {},
    // Six sliders (52 px each) are taller than the default panel slot — lift it clear of the bottom ruler
    panel: { y: height - 560 },
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

  // The original 1080 px canvas maps to the 4-unit grid; its centre is (2, 2).
  const CENTER: Pt2 = [2, 2];

  // Build a closed path in world space, then paint it in screen space
  const path = (ctx: CanvasRenderingContext2D, cam: Camera, pts: Pt2[]) => {
    ctx.save();
    cam.apply(ctx);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.restore();
  };

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const { vertices, truncation, radius, rotation, weight, palette } = view.params;
    const colors = palettes[Math.round(palette)] ?? palettes[0];

    const fill = (color: string) => {
      ctx.fillStyle = view.magnified ? shell.hatch(color) : color;
      ctx.fill();
    };
    // Stroke width is a world length (`weight` px of the original ÷ 270), so it
    // scales with zoom and magnification via the camera's pixels-per-unit.
    const shape = (pts: Pt2[], color: string, weightPx: number) => {
      path(ctx, cam, pts);
      if (weightPx > 0) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = weightPx * shell.px * cam.scale;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      fill(color);
    };

    const polygon = generatePolygon(vertices, radius, CENTER, rotation);
    const midpoints = generateMidpoints(polygon);
    const truncated = truncatePolygon(generateSplitVertices(polygon, midpoints), truncation);

    shape(polygon, colors[0], weight);
    shape(truncated, colors[1], weight * 0.75);
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
