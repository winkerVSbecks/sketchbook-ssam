import { Bezier } from 'bezier-js';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { palettes } from '../../colors/mindful-palettes';
import { createShell, theme, type Camera, type SceneView } from '../../ui';

/**
 * Torsions — seven blocks hanging from the top edge, each twisted about its
 * vertical axis. Ported from a canvas-sketch loop (800×600); the `twist`
 * slider scrubs the original playhead, `stagger` scales the per-block phase
 * offset (1 = original, 0 = all blocks identical), `weight` is the outline and
 * `palette` picks a Mindful Palette for the faces.
 */

const OUTLINE = theme.ink;

interface FaceColors {
  front: string;
  back: string;
  edge: string;
}

/**
 * Face colours from palette `idx`: front ← [0], back ← [1], thick edge ← [2].
 * Palettes shorter than three colours wrap; a missing edge colour falls back to
 * the paper so the edge still reads as a lit surface.
 */
function faceColors(idx: number): FaceColors {
  const palette =
    palettes[Math.min(Math.max(Math.round(idx), 0), palettes.length - 1)];
  const at = (i: number) => palette[i % palette.length];
  return {
    front: at(0),
    back: at(1),
    edge: palette.length >= 3 ? at(2) : theme.paper,
  };
}

/**
 * Shear factor for the thick edge. Dimensionless, but the original derived it
 * from the block width in pixels (`w * 0.002` at 800 px wide), so we keep that
 * value rather than rescale it with the world-unit width.
 */
const THICKNESS = (800 / 11) * 0.002;

type Pt2 = [number, number];
/** cp1x, cp1y, cp2x, cp2y, x, y — the tail of a `bezierCurveTo` call. */
type CurveTail = [number, number, number, number, number, number];

interface BlockProps {
  x: number;
  y: number;
  width: number;
  height: number;
  thickness: number;
  playhead: number;
}

interface Edge {
  ec1: CurveTail;
  ec2: CurveTail;
  a: Pt2;
  b: Pt2;
  c: Pt2;
}

// --- Math helpers (canvas-sketch-util/math equivalents) -----------------------

const mapRange = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);

/** Piecewise-linear interpolation through `values` evenly spaced over t ∈ [0, 1]. */
function lerpFrames(values: number[], t: number): number {
  const n = values.length - 1;
  const tt = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(tt), n - 1);
  const f = tt - i;
  return values[i] + (values[i + 1] - values[i]) * f;
}

// --- Geometry (ported from torsions.js; y-down local frame) -------------------

/**
 * Calculate the X component for the bottom vertices: a point on a half circle
 * of radius width/2, sheared both ways by `thickness`.
 */
function bottomVerticesX({
  x,
  width,
  thickness: s,
  playhead: t,
}: Omit<BlockProps, 'y' | 'height'>): Pt2 {
  const angle = Math.PI + Math.PI * t;
  const r = width / 2;

  const p = [x + r + r * Math.cos(angle), r * Math.sin(angle)];
  const p1 = [p[0] + p[1] * s, p[1] + -p[0] * s];
  const p2 = [p[0] + -p[1] * s, p[1] + p[0] * s];

  return [p1[0], p2[0]];
}

/**
 * The bezier curve definition for the edge curve.
 * Returns the two control points and the end point.
 */
function edgeCurve(
  [x1, y1]: Pt2,
  [x2, y2]: Pt2,
  playhead: number,
  perspective = false,
): CurveTail {
  const K1 = 0.37;
  const K2 = perspective
    ? lerpFrames([0, 0, 0.6], playhead)
    : lerpFrames([0, 0, 0.37], playhead);

  const cp1: Pt2 = [x1, y1 + K1 * (y2 - y1)];
  const cp2: Pt2 = [x2, y2 - K2 * (y2 - y1)];

  return [...cp1, ...cp2, x2, y2];
}

/**
 *    *       *
 *
 *    b(edge1) b(edge2)
 *    (point where curve starts)
 *
 *    * a c   *
 */
function edge(
  b: Pt2,
  { x, y, width, height, thickness, playhead: rawPlayhead }: BlockProps,
  hiddenEdge: boolean,
  perspective = false,
): Edge {
  const playhead = hiddenEdge ? 1 - rawPlayhead : rawPlayhead;

  const [aX, cX] = bottomVerticesX({ width, thickness, playhead, x });

  const a: Pt2 = [aX, y + height];
  const c: Pt2 = [cX, y + height];
  const ec1 = edgeCurve(b, a, rawPlayhead);
  const ec2 = edgeCurve(b, c, rawPlayhead, perspective);

  return { ec1, ec2, a, b, c };
}

interface Intersections {
  tA: Pt2 | undefined;
  tB: Pt2 | undefined;
  curve1: Bezier;
  curve2: Bezier;
  curve3: Bezier;
  curve4: Bezier;
}

/**
 * Find intersections between curve pairs. We draw double curves, so we look
 * for the intersection of the outside curve from one side with the inside
 * curve from the other:  curve1 curve3 curve2 curve4
 */
function intersections(edge1: Edge, edge2: Edge): Intersections {
  const curve1 = new Bezier(...edge1.b, ...edge1.ec2);
  const curve2 = new Bezier(...edge2.b, ...edge2.ec2);

  const curve3 = new Bezier(...edge1.b, ...edge1.ec1);
  const curve4 = new Bezier(...edge2.b, ...edge2.ec1);

  // Curve–curve intersections come back as "t1/t2" strings
  const parse = (pairs: (string | number)[]): Pt2[] =>
    pairs
      .filter((p): p is string => typeof p === 'string')
      .map((pair) => pair.split('/').map((v) => parseFloat(v)) as Pt2);

  const tA = parse(curve2.intersects(curve1, 0.1));
  const tB = parse(curve4.intersects(curve3, 0.1));

  return { tA: tA[0], tB: tB[0], curve1, curve2, curve3, curve4 };
}

/** Append a cubic to the current path, optionally moving to its start or tracing it backwards. */
function drawBezierCurve(
  ctx: CanvasRenderingContext2D,
  curve: Bezier,
  { move = true, reverse = false }: { move?: boolean; reverse?: boolean } = {},
) {
  const [p0, p1, p2, p3] = curve.points;
  if (move) ctx.moveTo(p0.x, p0.y);
  if (reverse) ctx.bezierCurveTo(p2.x, p2.y, p1.x, p1.y, p0.x, p0.y);
  else ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
}

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

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    params: [
      {
        id: 'twist',
        label: 'Twist',
        min: 0,
        max: 1,
        value: 0.35,
        step: 0.01,
        knobColor: '#8a5cf5',
      },
      {
        id: 'stagger',
        label: 'Stagger',
        min: 0,
        max: 1,
        value: 1,
        step: 0.01,
        knobColor: '#e8541e',
      },
      {
        id: 'weight',
        label: 'Weight',
        min: 0.5,
        max: 6,
        value: 2,
        step: 0.25,
        knobColor: '#111111',
      },
      {
        id: 'palette',
        label: 'Palette',
        min: 0,
        max: palettes.length - 1,
        value: 0,
        step: 1,
        knobColor: '#111111',
      },
    ],
    // Four sliders are taller than the default panel slot — lift it clear of the bottom ruler
    panel: { y: height - 400 },
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

  // The fit view spans 4 world units across; its height follows the 4:3 viewport.
  const W = shell.camera.units;
  const H = shell.camera.fitCenter.y * 2;

  /**
   * Build a path in the original's y-down frame (origin top-left of the grid),
   * mapped into world space under the camera, then restore so the caller can
   * fill/stroke in screen space.
   */
  const inWorld = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    build: () => void,
  ) => {
    ctx.save();
    cam.apply(ctx);
    ctx.translate(0, H);
    ctx.scale(1, -1);
    ctx.beginPath();
    build();
    ctx.restore();
  };

  /**
   *    U       V
   *    *       *
   *
   *    p       q
   *
   *       ta
   *       tb
   *
   *    *  s r  *
   */
  const drawFaces = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    view: SceneView,
    { tA, tB, curve1, curve2, curve3, curve4 }: Intersections,
    { x, y, width }: Pick<BlockProps, 'x' | 'y' | 'width'>,
    clrs: FaceColors,
  ) => {
    const U: Pt2 = [x, y];
    const V: Pt2 = [x + width, y];
    const [p, , , s] = curve3.points;
    const [q, , , r] = curve2.points;
    const fill = (color: string) => {
      ctx.fillStyle = view.magnified ? shell.hatch(color) : color;
      ctx.fill();
      ctx.stroke();
    };

    if (tA && tB) {
      // Found an intersection: draw chunks of the front and back parts
      inWorld(ctx, cam, () => {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(...U);
        ctx.lineTo(...V);
        ctx.lineTo(q.x, q.y);
        drawBezierCurve(ctx, curve2.split(tA[0]).left);
        drawBezierCurve(ctx, curve1.split(tA[1]).left, {
          move: false,
          reverse: true,
        });
      });
      fill(clrs.front);

      inWorld(ctx, cam, () => {
        ctx.moveTo(s.x, s.y);
        drawBezierCurve(ctx, curve3.split(tB[1]).right, {
          move: false,
          reverse: true,
        });
        drawBezierCurve(ctx, curve4.split(tB[0]).right, { move: false });
        ctx.closePath();
      });
      fill(clrs.back);
    } else {
      // No intersection: draw the full front face
      inWorld(ctx, cam, () => {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(...U);
        ctx.lineTo(...V);
        ctx.lineTo(q.x, q.y);
        drawBezierCurve(ctx, curve2, { move: false });
        ctx.lineTo(s.x, s.y);
        drawBezierCurve(ctx, curve3, { move: false, reverse: true });
      });
      fill(clrs.front);
    }
  };

  /** The thick front edge: two curves from b, closed along the bottom, filled even-odd. */
  const drawFrontEdge = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    view: SceneView,
    { ec1, ec2, a, b }: Edge,
    clrs: FaceColors,
  ) => {
    inWorld(ctx, cam, () => {
      ctx.moveTo(...b);
      ctx.bezierCurveTo(...ec1);
      ctx.moveTo(...b);
      ctx.bezierCurveTo(...ec2);
      ctx.lineTo(...a);
    });
    ctx.fillStyle = view.magnified ? shell.hatch(clrs.edge) : clrs.edge;
    ctx.fill('evenodd');
    ctx.stroke();
  };

  const drawBlock = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    view: SceneView,
    block: BlockProps,
    clrs: FaceColors,
  ) => {
    const { x, y, width, height, playhead } = block;
    // Start points for the edge curves
    const b1: Pt2 = [x, mapRange(playhead, 0, 1, y + height, y)];
    const b2: Pt2 = [x + width, mapRange(playhead, 0, 1, y + height, y)];

    const edge1 = edge(b1, block, false, true);
    const edge2 = edge(b2, block, true);

    drawFaces(
      ctx,
      cam,
      view,
      intersections(edge1, edge2),
      { x, y, width },
      clrs,
    );
    drawFrontEdge(ctx, cam, view, edge1, clrs);
  };

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    view: SceneView,
  ) => {
    const { twist, stagger, weight, palette } = view.params;
    const clrs = faceColors(palette);

    ctx.lineWidth = weight * view.magnification;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;

    const margin = W / 22;
    const w = W / 11;

    // The original's ping-pong playhead, with the per-block phase scaled by `stagger`
    const pingPong = (idx: number) =>
      Math.abs(Math.sin(twist * Math.PI + (stagger * (Math.PI / 4) * idx) / 6));

    for (let idx = 0; idx < 7; idx++) {
      drawBlock(
        ctx,
        cam,
        view,
        {
          x: margin + (w + margin) * idx,
          y: margin,
          width: w,
          height: H - w,
          thickness: THICKNESS,
          playhead: Math.min(pingPong(idx), 0.99),
        },
        clrs,
      );
    }
  };

  wrap.render = () => shell.render(drawScene);
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 810],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
