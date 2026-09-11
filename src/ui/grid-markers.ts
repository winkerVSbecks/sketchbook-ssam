import type { Camera } from './camera';
import { labelFont, roundRectPath, theme } from './types';

export interface GridMarkersOptions {
  width: number;
  height: number;
  /** Outer band that holds the labels. */
  margin?: number;
  /** Major cells. */
  cols: number;
  rows: number;
  /** Minor cells per major cell — the grid "resolution". */
  subdivisions?: number;
  xLabels?: 'numbers' | 'letters';
  yLabels?: 'numbers' | 'letters';
  /** Which side label 1 / A starts from. */
  xOrigin?: 'left' | 'right';
  yOrigin?: 'bottom' | 'top';
  /** Graduation column inside the frame on the right: numbered ticks + a solid bar per major row. */
  ruler?: boolean;
  /** Labelled graduations per major row (default `subdivisions × 2`). A short tick sits between each pair. */
  rulerDivisions?: number;
  /** Where `01` sits within each major row on the ruler (reference counts from the top). */
  rulerOrigin?: 'top' | 'bottom';
  /** Gap (px) between a major row's edge and its first/last graduation. Default: half a graduation step. */
  rulerInset?: number;
  /** Corner radius of the outer frame. */
  frameRadius?: number;
  ink?: string;
  /**
   * Zoomable mode: grid lines, labels and graduations follow the camera in
   * world coordinates (one unit = one base cell at zoom 1). Major labels sit on
   * the lines and show world values; the graduation column shows finer values.
   * Axis directions come from the camera's `flipX`/`flipY`; `xOrigin`/`yOrigin`
   * are ignored.
   */
  camera?: Camera;
}

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … */
export function letterLabel(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const numberLabel = (i: number) => String(i + 1);
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Smallest "nice" step (1, 2, 5 × 10ⁿ) that is ≥ `target`. */
export function niceStep(target: number): number {
  if (!(target > 0) || !Number.isFinite(target)) return 1;
  const base = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) if (m * base >= target - 1e-12) return m * base;
  return 10 * base;
}

/** Format a world value with just enough decimals for `step`, trailing zeros trimmed. */
export function formatValue(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = v.toFixed(decimals).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m));
  return s === '-0' ? '0' : s;
}

/** Letter for a signed row index: 0 → A, −1 → −A. */
const rowLetter = (i: number) => (i >= 0 ? letterLabel(i) : `−${letterLabel(-i - 1)}`);

const rulerWidth = (margin: number, ruler: boolean) => (ruler ? Math.max(52, margin * 1.25) : 0);

/**
 * Draw a labelled reference grid inside a rounded frame: dotted minor grid,
 * hairline major lines, tick marks on the frame, labels on all four sides and
 * an optional graduation column (ruler) inside the frame on the right.
 * Pure — safe to call every frame.
 */
export function drawGridMarkers(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    margin = 40,
    cols,
    rows,
    subdivisions = 6,
    xLabels = 'numbers',
    yLabels = 'letters',
    xOrigin = 'left',
    yOrigin = 'bottom',
    ruler = true,
    rulerDivisions = subdivisions * 2,
    rulerOrigin = 'top',
    rulerInset,
    frameRadius = 14,
    ink = theme.ink,
    camera,
  }: GridMarkersOptions,
) {
  if (camera) {
    drawZoomGrid(ctx, camera, {
      width, height, margin, subdivisions, ruler, rulerInset, frameRadius, ink,
      yLabels, xLabels,
    });
    return;
  }
  const rulerW = rulerWidth(margin, ruler);
  // Frame encloses the grid and the ruler column
  const fx0 = margin;
  const fy0 = margin;
  const fx1 = width - margin;
  const fy1 = height - margin;
  // Grid area (ruler column excluded)
  const x0 = fx0;
  const y0 = fy0;
  const x1 = fx1 - rulerW;
  const y1 = fy1;
  const gw = x1 - x0;
  const gh = y1 - y0;
  const cw = gw / cols;
  const ch = gh / rows;
  const minorX = cw / subdivisions;
  const minorY = ch / subdivisions;

  const labelFor = (kind: 'numbers' | 'letters', i: number) =>
    kind === 'numbers' ? numberLabel(i) : letterLabel(i);
  const colIndex = (c: number) => (xOrigin === 'left' ? c : cols - 1 - c);
  const rowIndex = (r: number) => (yOrigin === 'top' ? r : rows - 1 - r);

  ctx.save();
  ctx.lineCap = 'butt';

  // Clip everything inside the frame to its rounded outline
  ctx.save();
  roundRectPath(ctx, { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 }, frameRadius);
  ctx.clip();

  // Minor dotted grid — verticals in the grid area, horizontals across the frame
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.setLineDash([1.5, 3]);
  ctx.beginPath();
  for (let i = 0; i <= cols * subdivisions; i++) {
    if (i % subdivisions === 0) continue;
    const x = x0 + i * minorX;
    ctx.moveTo(x, fy0);
    ctx.lineTo(x, fy1);
  }
  for (let j = 0; j <= rows * subdivisions; j++) {
    if (j % subdivisions === 0) continue;
    const y = y0 + j * minorY;
    ctx.moveTo(fx0, y);
    ctx.lineTo(fx1, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Major hairlines
  ctx.strokeStyle = theme.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < cols; c++) {
    const x = x0 + c * cw;
    ctx.moveTo(x, fy0);
    ctx.lineTo(x, fy1);
  }
  for (let r = 1; r < rows; r++) {
    const y = y0 + r * ch;
    ctx.moveTo(fx0, y);
    ctx.lineTo(fx1, y);
  }
  ctx.stroke();

  // Ruler: labels | alternating ticks | bar, per major row
  if (ruler) {
    const numX = x1 + rulerW * 0.5; // right edge of the numerals
    const tickX = x1 + rulerW * 0.56;
    const longTick = rulerW * 0.18;
    const shortTick = longTick * 0.5;
    const barX = x1 + rulerW * 0.74;
    const barW = rulerW * 0.14;
    // Graduations are inset from the row edges so the first/last numerals don't crowd the boundary
    const inset = rulerInset ?? (ch / rulerDivisions) * 0.5;
    const divH = (ch - inset * 2) / rulerDivisions;
    const subFont = Math.min(13, Math.max(7, divH * 0.6));
    ctx.font = labelFont(subFont, 400);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.25;
    for (let r = 0; r < rows; r++) {
      const top = y0 + r * ch;
      // Bar spans the graduation range, so it's inset from the row edges like the numerals
      ctx.fillRect(barX, top + inset, barW, ch - inset * 2);
      ctx.beginPath();
      for (let d = 0; d < rulerDivisions; d++) {
        const cy = top + inset + (d + 0.5) * divH;
        const idx = rulerOrigin === 'top' ? d + 1 : rulerDivisions - d;
        ctx.fillText(pad2(idx), numX, cy);
        // Long tick at the label, short tick halfway to the next label
        ctx.moveTo(tickX, cy);
        ctx.lineTo(tickX + longTick, cy);
        if (d < rulerDivisions - 1) {
          const my = cy + divH / 2;
          ctx.moveTo(tickX + longTick - shortTick, my);
          ctx.lineTo(tickX + longTick, my);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore(); // clip

  // Frame
  roundRectPath(ctx, { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 }, frameRadius);
  ctx.strokeStyle = ink;
  ctx.lineWidth = theme.border;
  ctx.stroke();

  // Tick marks outside the frame at each major boundary (same weight as the frame);
  // they stop at the frame's outer edge rather than crossing into it
  const tick = Math.min(8, margin * 0.2);
  const half = theme.border / 2;
  ctx.lineWidth = theme.border;
  ctx.beginPath();
  for (let c = 1; c < cols; c++) {
    const x = x0 + c * cw;
    ctx.moveTo(x, fy0 - half - tick);
    ctx.lineTo(x, fy0 - half);
    ctx.moveTo(x, fy1 + half);
    ctx.lineTo(x, fy1 + half + tick);
  }
  for (let r = 1; r < rows; r++) {
    const y = y0 + r * ch;
    ctx.moveTo(fx0 - half - tick, y);
    ctx.lineTo(fx0 - half, y);
    ctx.moveTo(fx1 + half, y);
    ctx.lineTo(fx1 + half + tick, y);
  }
  ctx.stroke();

  // Labels centred on each major cell, in the middle of the margin on all four sides
  const fontSize = Math.min(18, Math.max(11, margin * 0.42));
  const labelOut = margin / 2;
  ctx.font = labelFont(fontSize, 400);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = 0; c < cols; c++) {
    const x = x0 + (c + 0.5) * cw;
    const t = labelFor(xLabels, colIndex(c));
    ctx.fillText(t, x, fy0 - labelOut);
    ctx.fillText(t, x, fy1 + labelOut);
  }
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * ch;
    const t = labelFor(yLabels, rowIndex(r));
    ctx.fillText(t, fx0 - labelOut, y);
    ctx.fillText(t, fx1 + labelOut, y);
  }

  ctx.restore();
}

interface ZoomGridOptions {
  width: number;
  height: number;
  margin: number;
  subdivisions: number;
  ruler: boolean;
  rulerInset?: number;
  frameRadius: number;
  ink: string;
  xLabels: 'numbers' | 'letters';
  yLabels: 'numbers' | 'letters';
}

/** Camera-driven grid: world-anchored lines, value labels on the lines, value graduations. */
function drawZoomGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  { width, height, margin, subdivisions, ruler, rulerInset, frameRadius, ink, xLabels, yLabels }: ZoomGridOptions,
) {
  const rulerW = rulerWidth(margin, ruler);
  const fx0 = margin;
  const fy0 = margin;
  const fx1 = width - margin;
  const fy1 = height - margin;
  const x0 = fx0;
  const x1 = fx1 - rulerW;
  const frame = { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };

  const scale = camera.scale;
  // World units per major cell: the smallest nice step that keeps cells ≥ 75 % of the base size
  const step = niceStep(0.75 / camera.zoom);
  const minor = step / subdivisions;
  const vis = camera.visibleWorld();
  const sx = (wx: number) => camera.worldToScreen({ x: wx, y: 0 }).x;
  const sy = (wy: number) => camera.worldToScreen({ x: 0, y: wy }).y;
  const range = (lo: number, hi: number, s: number) => {
    const out: number[] = [];
    for (let k = Math.ceil(lo / s - 1e-9); k <= Math.floor(hi / s + 1e-9); k++) out.push(k);
    return out;
  };
  const inGridX = (x: number) => x >= x0 && x <= x1;
  const inFrameY = (y: number) => y >= fy0 && y <= fy1;

  const majorXs = range(vis.x, vis.x + vis.w, step);
  const majorYs = range(vis.y, vis.y + vis.h, step);

  ctx.save();
  ctx.lineCap = 'butt';

  ctx.save();
  roundRectPath(ctx, frame, frameRadius);
  ctx.clip();

  // Minor dotted grid (skip multiples of the major step); horizontals run on across the ruler column
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.setLineDash([1.5, 3]);
  ctx.beginPath();
  for (const k of range(vis.x, vis.x + vis.w, minor)) {
    if (k % subdivisions === 0) continue;
    const x = sx(k * minor);
    if (!inGridX(x)) continue;
    ctx.moveTo(x, fy0);
    ctx.lineTo(x, fy1);
  }
  for (const k of range(vis.y, vis.y + vis.h, minor)) {
    if (k % subdivisions === 0) continue;
    const y = sy(k * minor);
    if (!inFrameY(y)) continue;
    ctx.moveTo(fx0, y);
    ctx.lineTo(fx1, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Major hairlines
  ctx.strokeStyle = theme.hairline;
  ctx.beginPath();
  for (const i of majorXs) {
    const x = sx(i * step);
    if (!inGridX(x)) continue;
    ctx.moveTo(x, fy0);
    ctx.lineTo(x, fy1);
  }
  for (const i of majorYs) {
    const y = sy(i * step);
    if (!inFrameY(y)) continue;
    ctx.moveTo(fx0, y);
    ctx.lineTo(fx1, y);
  }
  ctx.stroke();

  // Graduation column: value labels at a fine nice step (~20 px apart), alternating ticks, bar per row
  if (ruler) {
    // Graduation step: ~20 px apart, but never finer than 0.1 so labels stay at one decimal
    const sub = Math.max(0.1, niceStep(20 / scale));
    const subPx = sub * scale;
    const inset = rulerInset ?? subPx * 0.5;
    const numX = x1 + rulerW * 0.52;
    const tickX = x1 + rulerW * 0.56;
    const longTick = rulerW * 0.18;
    const shortTick = longTick * 0.5;
    const barX = x1 + rulerW * 0.74;
    const barW = rulerW * 0.14;
    const distToMajorPx = (v: number) => {
      const m = ((v % step) + step) % step;
      return Math.min(m, step - m) * scale;
    };
    ctx.font = labelFont(Math.min(11, Math.max(7, subPx * 0.55)), 400);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (const k of range(vis.y, vis.y + vis.h, sub)) {
      const v = k * sub;
      const y = sy(v);
      if (inFrameY(y) && distToMajorPx(v) >= inset - 1e-6) {
        ctx.fillText(formatValue(v, sub), numX, y);
        ctx.moveTo(tickX, y);
        ctx.lineTo(tickX + longTick, y);
      }
      const vh = v + sub / 2;
      const yh = sy(vh);
      if (inFrameY(yh) && distToMajorPx(vh) >= inset - 1e-6) {
        ctx.moveTo(tickX + longTick - shortTick, yh);
        ctx.lineTo(tickX + longTick, yh);
      }
    }
    ctx.stroke();
    // Bars: one per major row, inset from the row's lines (clipped by the frame)
    for (let i = Math.floor(vis.y / step) - 1; i <= Math.floor((vis.y + vis.h) / step) + 1; i++) {
      const a = sy(i * step);
      const b = sy((i + 1) * step);
      const top = Math.min(a, b) + inset;
      const h = Math.abs(b - a) - inset * 2;
      if (h > 0) ctx.fillRect(barX, top, barW, h);
    }
  }
  ctx.restore(); // clip

  // Frame
  roundRectPath(ctx, frame, frameRadius);
  ctx.strokeStyle = ink;
  ctx.lineWidth = theme.border;
  ctx.stroke();

  // Outside ticks at each visible major line
  const tick = Math.min(8, margin * 0.2);
  const half = theme.border / 2;
  ctx.beginPath();
  for (const i of majorXs) {
    const x = sx(i * step);
    if (x <= x0 + frameRadius || x >= x1) continue;
    ctx.moveTo(x, fy0 - half - tick);
    ctx.lineTo(x, fy0 - half);
    ctx.moveTo(x, fy1 + half);
    ctx.lineTo(x, fy1 + half + tick);
  }
  for (const i of majorYs) {
    const y = sy(i * step);
    if (y <= fy0 + frameRadius || y >= fy1 - frameRadius) continue;
    ctx.moveTo(fx0 - half - tick, y);
    ctx.lineTo(fx0 - half, y);
    ctx.moveTo(fx1 + half, y);
    ctx.lineTo(fx1 + half + tick, y);
  }
  ctx.stroke();

  // Labels: X values on the lines (top/bottom), Y row letters between lines (left/right),
  // in the middle of the margin
  const fontSize = Math.min(18, Math.max(11, margin * 0.42));
  const labelOut = margin / 2;
  ctx.font = labelFont(fontSize, 400);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const i of majorXs) {
    const x = sx(i * step);
    if (x < x0 + 10 || x > x1 - 10) continue;
    const t = xLabels === 'numbers' ? formatValue(i * step, step) : rowLetter(i);
    ctx.fillText(t, x, fy0 - labelOut);
    ctx.fillText(t, x, fy1 + labelOut);
  }
  for (let i = Math.floor(vis.y / step); i <= Math.floor((vis.y + vis.h) / step); i++) {
    const y = sy((i + 0.5) * step);
    if (y < fy0 + 8 || y > fy1 - 8) continue;
    const t = yLabels === 'letters' ? rowLetter(i) : formatValue(i * step, step);
    ctx.fillText(t, fx0 - labelOut, y);
    ctx.fillText(t, fx1 + labelOut, y);
  }

  ctx.restore();
}

/** The grid area (frame minus the ruler column) — handy for placing the subject. */
export function gridMarkersInnerRect({
  width,
  height,
  margin = 40,
  ruler = true,
}: Pick<GridMarkersOptions, 'width' | 'height' | 'margin' | 'ruler'>) {
  const rulerW = rulerWidth(margin, ruler);
  return {
    x: margin,
    y: margin,
    w: width - margin * 2 - rulerW,
    h: height - margin * 2,
  };
}
