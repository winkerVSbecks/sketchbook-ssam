import Random from 'canvas-sketch-util/random';
import { mapRange, lerpFrames } from 'canvas-sketch-util/math';
import eases from 'eases';
import type { Walker } from './types';

export function drawPath(
  context: CanvasRenderingContext2D,
  walker: Walker,
  playhead: number,
  backgroundColor: string,
  paths: Line[]
) {
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size;

  const time = Math.sin(playhead * Math.PI);
  const t = eases.quadInOut(time);

  const [l1, l2] = walker.lengths;

  paths.forEach((pts) => {
    if (typeof walker.pathStyle === 'function') {
      walker.pathStyle(context, walker, pts, playhead);
    } else {
      pathStyles[walker.pathStyle](
        context,
        walker,
        pts,
        [l1, l2],
        t,
        backgroundColor,
        playhead
      );
    }
  });
}

function solidStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
}

function animatedLine(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  _: [number, number],
  t: number,
  backgroundColor: string,
  playhead: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';

  const time = lerpFrames([0, 1, 1, 0, 0], playhead);

  // animate the line drawing
  context.setLineDash([l, l]);
  context.lineDashOffset = lerpFrames([l, 0], time);

  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
}

function pipeStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  [l1, l2]: [number, number],
  t: number,
  backgroundColor: string
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.setLineDash([l, 0]);
  context.lineDashOffset = 0;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // bg
  context.strokeStyle = backgroundColor;
  context.lineWidth = walker.size;
  drawShape(context, pts, false);
  context.stroke();

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();

  // middle
  context.setLineDash([l * l1 /* 0.5 */, l]);
  context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1) /* 0.5 */);
  context.strokeStyle = backgroundColor;
  context.lineWidth = walker.size - walker.stepSize * 2;
  drawShape(context, pts, false);
  context.stroke();

  // inner
  context.setLineDash([l * l2 /* 0.3 */, l]);
  context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l2) /* 0.7 */);
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize * 4;
  drawShape(context, pts, false);
  context.stroke();
}

function infinitePipeStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  _: [number, number],
  t: number,
  backgroundColor: string,
  playhead: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.strokeStyle = backgroundColor;
  context.lineWidth = walker.size;
  drawShape(context, pts, false);
  context.stroke();

  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();

  context.save();
  context.setLineDash([l / 4, l / 2]);

  context.lineDashOffset = lerpFrames([0, 0.75 * l], playhead);
  context.strokeStyle = backgroundColor;
  context.lineWidth = 1;
  drawShape(context, pts, false);
  context.stroke();
  context.restore();
}

function highlightStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  [l1, _]: [number, number],
  t: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.setLineDash([l, 0]);
  context.lineDashOffset = 0;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // bg
  // context.strokeStyle = backgroundColor;
  // context.lineWidth = walker.size;
  // drawShape(context, pts, false);
  // context.stroke();

  context.strokeStyle = walker.highlightColor; // walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();

  // middle
  const noiseHeadT = Random.noise3D(t, pts[0][0], pts[0][1]);
  const noiseTailT = Random.noise3D(
    t,
    pts[pts.length - 1][0],
    pts[pts.length - 1][1]
  );
  context.setLineDash([l * l1, l * noiseTailT]);
  context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));

  // context.setLineDash([l, l]);
  // context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(t, 0, 1, -l * 0.9, 0);
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
}

function distressedStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  [l1, _]: [number, number],
  t: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.setLineDash([l, 0]);
  context.lineDashOffset = 0;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const noiseHeadT = Random.noise3D(t, pts[0][0], pts[0][1]);
  const noiseTailT = Random.noise3D(
    t,
    pts[pts.length - 1][0],
    pts[pts.length - 1][1]
  );
  context.setLineDash([l * l1, l * noiseTailT]);
  context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));

  // context.setLineDash([l, l]);
  // context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(t, 0, 1, -l * 0.9, 0);
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
}

function stitchStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash([walker.stepSize, walker.stepSize * 2]);

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = Math.max(walker.size / 4, 2);
  drawShape(context, pts, false);
  context.stroke();
  context.restore();
}

function thinLineStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = Math.max(walker.size / 4, 2);
  drawShape(context, pts, false);
  context.stroke();
}

function withNormalsStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = Math.max(walker.size / 4, 1);

  const d = walker.stepSize * 0.75;

  // Calculate normals for each point
  const normals = pts.map((pt, i) => {
    const a = pts[i - 1] || pt;
    const b = pts[i + 1] || pt;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);

    return dx === 0 || dy === 0
      ? ([(-dy / len) * d, (dx / len) * d] as Point)
      : [0, 0];
  });

  // Draw the path
  drawShape(context, pts, false);
  context.stroke();

  // Draw the normals
  pts.forEach((pt, i) => {
    const [nx, ny] = normals[i];
    context.beginPath();
    context.moveTo(pt[0] - nx, pt[1] - ny);
    context.lineTo(pt[0], pt[1]);
    context.lineTo(pt[0] + nx, pt[1] + ny);
    context.stroke();
  });
}

function polkaLine(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const width = walker.size - walker.stepSize;

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = width;

  // Draw the path
  drawShape(context, pts, false);
  context.stroke();

  const r = Math.max(width / 4, 2);

  pts.forEach((pt) => {
    context.beginPath();
    context.ellipse(pt[0], pt[1], r, r, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function dimpleLine(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const width = walker.size - walker.stepSize;

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = width / 4;

  // Draw the path
  drawShape(context, pts, false);
  context.stroke();

  context.fillStyle = walker.color;
  pts.forEach((pt) => {
    context.beginPath();
    context.ellipse(pt[0], pt[1], width / 2, width / 2, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

export type GradientColorFn = (info: {
  index: number;
  total: number;
  t: number;
  point: Point;
  nextPoint: Point;
  walker: Walker;
  playhead: number;
}) => string;

export interface GradientStyleOptions {
  /** Cap on every segment; `'square'` gives square turnarounds and ends. Default `'round'`. */
  lineCap?: CanvasLineCap;
  /** Join used where a segment is drawn as a polyline. Default `'round'`. */
  lineJoin?: CanvasLineJoin;
  /**
   * Fillet radius (px) for the inner corner of every perpendicular turn. The
   * outer edge is whatever the caps draw; only the inner notch is filled to
   * a quarter-circle. Clamped so the two fillets of a U-turn never overlap.
   * Default 0: sharp inner corners.
   */
  innerRadius?: number;
  /**
   * Fillet radius as a fraction (0–1) of the largest fillet that fits at
   * each turn, (shorter adjacent segment − line width) / 2 — so it follows
   * the local node spacing on grids where that varies (polar walks). The
   * larger of this and `innerRadius` applies. Default 0.
   */
  innerRadiusFraction?: number;
}

export function createGradientStyle(
  colorFn: GradientColorFn,
  {
    lineCap = 'round',
    lineJoin = 'round',
    innerRadius = 0,
    innerRadiusFraction = 0,
  }: GradientStyleOptions = {}
) {
  return function gradientStyle(
    context: CanvasRenderingContext2D,
    walker: Walker,
    pts: Point[],
    playhead: number
  ) {
    context.save();
    context.lineCap = lineCap;
    context.lineJoin = lineJoin;
    context.lineWidth = walker.size - walker.stepSize;

    const total = pts.length - 1;

    for (let i = 0; i < total; i++) {
      const point = pts[i];
      const nextPoint = pts[i + 1];
      const t = total > 0 ? i / total : 0;

      const color = colorFn({
        index: i,
        total,
        t,
        point,
        nextPoint,
        walker,
        playhead,
      });

      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(point[0], point[1]);
      context.lineTo(nextPoint[0], nextPoint[1]);
      context.stroke();
    }

    if (innerRadius > 0 || innerRadiusFraction > 0) {
      const half = context.lineWidth / 2;
      for (let i = 1; i < total; i++) {
        const color = colorFn({
          index: i,
          total,
          t: total > 0 ? i / total : 0,
          point: pts[i],
          nextPoint: pts[i + 1],
          walker,
          playhead,
        });
        fillInnerCorner(
          context,
          pts[i - 1],
          pts[i],
          pts[i + 1],
          half,
          innerRadius,
          innerRadiusFraction,
          color
        );
      }
    }

    context.restore();
  };
}

/**
 * Round the inner corner of the turn at `node` by filling the notch between
 * the two strokes' inner edges and a circle of radius `radius` tangent to
 * both. Works for any turn angle (polar grids turn by 90° ± a few degrees;
 * a shallow kink gets a long, flat sliver). The outer edge is untouched.
 * The fillet's two straight sides are pushed half a pixel into the ink so
 * only its arc meets the ground — two anti-aliased edges abutting would
 * leave a hairline.
 */
function fillInnerCorner(
  context: CanvasRenderingContext2D,
  prev: Point,
  node: Point,
  next: Point,
  half: number,
  radius: number,
  fraction: number,
  color: string
) {
  const lenIn = distance(prev, node);
  const lenOut = distance(node, next);
  if (lenIn < 1e-6 || lenOut < 1e-6) return;
  const d1: Point = [(node[0] - prev[0]) / lenIn, (node[1] - prev[1]) / lenIn];
  const d2: Point = [(next[0] - node[0]) / lenOut, (next[1] - node[1]) / lenOut];
  const cosTurn = d1[0] * d2[0] + d1[1] * d2[1];
  // Straight on (no notch) or a full reversal (no room): nothing to fill.
  if (cosTurn > 0.9999 || cosTurn < -0.9999) return;

  // Inward normals: the side each segment turns toward.
  const n1 = normalize([d2[0] - cosTurn * d1[0], d2[1] - cosTurn * d1[1]]);
  const n2 = normalize([-d1[0] + cosTurn * d2[0], -d1[1] + cosTurn * d2[1]]);

  // Inner vertex: where the two inner edge lines (offset `half` inward) meet.
  // Solve node + half·n1 + s·d1 = node + half·n2 + t·d2 for s.
  const rx = half * (n2[0] - n1[0]);
  const ry = half * (n2[1] - n1[1]);
  const det = -d1[0] * d2[1] + d1[1] * d2[0];
  if (Math.abs(det) < 1e-9) return;
  const sParam = (-rx * d2[1] + ry * d2[0]) / det;
  const c: Point = [
    node[0] + half * n1[0] + sParam * d1[0],
    node[1] + half * n1[1] + sParam * d1[1],
  ];

  // The notch is the wedge at `c` between u (back along the incoming inner
  // edge) and v (along the outgoing one), interior angle φ.
  const u: Point = [-d1[0], -d1[1]];
  const v: Point = d2;
  const cosPhi = u[0] * v[0] + u[1] * v[1];
  const phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
  const tanHalf = Math.tan(phi / 2);
  const sinHalf = Math.sin(phi / 2);
  if (tanHalf < 1e-6 || sinHalf < 1e-6) return;

  // Tangent length along each edge is r / tan(φ/2); two fillets sharing an
  // inner edge (a U-turn) must fit in it, so bound that length by half the
  // shorter inner edge.
  const maxTangent = (Math.min(lenIn, lenOut) - 2 * half) / 2;
  if (maxTangent <= 0) return;
  const maxFit = maxTangent * tanHalf;
  const r = Math.min(maxFit, Math.max(radius, fraction * maxFit));
  if (r <= 0) return;
  const tangent = r / tanHalf;

  const bis = normalize([u[0] + v[0], u[1] + v[1]]);
  const p: Point = [
    c[0] + (r / sinHalf) * bis[0],
    c[1] + (r / sinHalf) * bis[1],
  ];
  const t1: Point = [c[0] + tangent * u[0], c[1] + tangent * u[1]];
  const t2: Point = [c[0] + tangent * v[0], c[1] + tangent * v[1]];
  const bleed = 0.5;

  // Arc from t1 to t2 the short way round (the side facing the vertex).
  const a0 = Math.atan2(t1[1] - p[1], t1[0] - p[0]);
  const a1 = Math.atan2(t2[1] - p[1], t2[0] - p[0]);
  let delta = a1 - a0;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;

  context.fillStyle = color;
  context.beginPath();
  context.moveTo(
    c[0] - bleed * (n1[0] + n2[0]),
    c[1] - bleed * (n1[1] + n2[1])
  );
  context.lineTo(t1[0] - bleed * n1[0], t1[1] - bleed * n1[1]);
  context.lineTo(t1[0], t1[1]);
  context.arc(p[0], p[1], r, a0, a1, delta < 0);
  context.lineTo(t2[0] - bleed * n2[0], t2[1] - bleed * n2[1]);
  context.closePath();
  context.fill();
}

function normalize([x, y]: Point): Point {
  const len = Math.hypot(x, y);
  return len > 1e-12 ? [x / len, y / len] : [0, 0];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function drawShape(
  context: CanvasRenderingContext2D,
  [start, ...pts]: Point[],
  closed = true
) {
  context.beginPath();
  context.moveTo(...start);
  pts.forEach((pt) => {
    context.lineTo(...pt);
  });
  if (closed) {
    context.closePath();
  }
}

export const pathStyles = {
  solidStyle,
  animatedLine,
  pipeStyle,
  infinitePipeStyle,
  distressedStyle,
  highlightStyle,
  stitchStyle,
  thinLineStyle,
  withNormalsStyle,
  polkaLine,
  dimpleLine,
};
