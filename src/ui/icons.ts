import type { Rect } from './types';

/**
 * Feather icons ported from SVG to canvas. Geometry is in the 24-unit Feather
 * viewBox; `drawFeather` scales it into a square box. Stroke: 2 units, round
 * caps and joins, no fill — the same rendering rules as the SVG originals.
 */
export type FeatherPath = (ctx: CanvasRenderingContext2D) => void;

const line = (x1: number, y1: number, x2: number, y2: number): FeatherPath => (ctx) => {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
};

const polyline = (...pts: number[]): FeatherPath => (ctx) => {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
};

const circle = (cx: number, cy: number, r: number): FeatherPath => (ctx) => {
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
};

export const feather = {
  /** feather-x */
  x: [line(18, 6, 6, 18), line(6, 6, 18, 18)],
  /** feather-chevrons-right */
  chevronsRight: [polyline(13, 17, 18, 12, 13, 7), polyline(6, 17, 11, 12, 6, 7)],
  /** feather-chevrons-down */
  chevronsDown: [polyline(7, 13, 12, 18, 17, 13), polyline(7, 6, 12, 11, 17, 6)],
  /** feather-zoom-in */
  zoomIn: [circle(11, 11, 8), line(21, 21, 16.65, 16.65), line(11, 8, 11, 14), line(8, 11, 14, 11)],
} satisfies Record<string, FeatherPath[]>;

/** Stroke `paths` (24-unit space) into the largest centred square inside `box`. */
export function drawFeather(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  paths: FeatherPath[],
  color: string,
  strokeWidth = 2,
) {
  const s = Math.min(box.w, box.h) / 24;
  ctx.save();
  ctx.translate(box.x + (box.w - 24 * s) / 2, box.y + (box.h - 24 * s) / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const p of paths) p(ctx);
  ctx.stroke();
  ctx.restore();
}

/** Square box of side `size` centred at (cx, cy). */
export const centredBox = (cx: number, cy: number, size: number): Rect => ({
  x: cx - size / 2,
  y: cy - size / 2,
  w: size,
  h: size,
});
