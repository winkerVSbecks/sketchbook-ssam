export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Cursor =
  | 'default'
  | 'pointer'
  | 'grab'
  | 'grabbing'
  | 'move'
  | 'crosshair'
  | 'nwse-resize';

/**
 * Anything that can live inside a window. All coordinates are logical sketch
 * coordinates (ssam `width`/`height`), never device pixels. Interaction
 * handlers are pure: they return `true` when the control changed state (or
 * consumed the event) so the host can decide whether to repaint.
 */
export interface Control {
  /** Set to `false` to opt out of the window's rounded cell frame (default true). */
  cell?: boolean;
  /** Height the control wants for the given width. */
  measure(width: number): number;
  /** Paint into `rect`; the host has already laid the control out. */
  draw(ctx: CanvasRenderingContext2D, rect: Rect): void;
  pointerDown(pt: Pt, rect: Rect): boolean;
  pointerMove(pt: Pt, rect: Rect): boolean;
  pointerUp(pt: Pt, rect: Rect): boolean;
  cursorAt(pt: Pt, rect: Rect): Cursor | null;
}

export interface Theme {
  ink: string;
  paper: string;
  pencil: string;
  hairline: string;
  fill: string;
  fontFamily: string;
  labelSize: number;
  border: number;
  borderActive: number;
  radius: number;
  titleBarHeight: number;
}

/** "The Flat File": achromatic chrome, hairlines, tabular numerals. */
export const theme: Theme = {
  ink: '#111111',
  paper: '#ffffff',
  pencil: '#767676',
  hairline: 'rgba(0, 0, 0, 0.35)',
  fill: '#e6e6e6',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  labelSize: 13,
  border: 2,
  borderActive: 2.5,
  radius: 4,
  titleBarHeight: 33,
};

export const contains = (r: Rect, p: Pt): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Rounded-rect path helper (does not fill or stroke). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  { x, y, w, h }: Rect,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Small solid triangle in the bottom-right corner of `rect`, as in the reference UI. */
export function drawCornerMarker(
  ctx: CanvasRenderingContext2D,
  { x, y, w, h }: Rect,
  size = 7,
  inset = 4,
  color = theme.ink,
) {
  const bx = x + w - inset;
  const by = y + h - inset;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - size, by);
  ctx.lineTo(bx, by - size);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function labelFont(size = theme.labelSize, weight = 500): string {
  return `${weight} ${size}px ${theme.fontFamily}`;
}
