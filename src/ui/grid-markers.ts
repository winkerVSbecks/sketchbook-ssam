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
  /** Canvas background, used to knock out a box behind graduation numerals. */
  paper?: string;
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

/** Largest "nice" step (1, 2, 5 × 10ⁿ) that is ≤ `target`. */
export function niceStepFloor(target: number): number {
  if (!(target > 0) || !Number.isFinite(target)) return 1;
  const base = 10 ** Math.floor(Math.log10(target));
  for (const m of [5, 2, 1]) if (m * base <= target + 1e-12) return m * base;
  return base;
}

/** Format a world value with just enough decimals for `step`, trailing zeros trimmed. */
export function formatValue(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = v.toFixed(decimals).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m));
  return s === '-0' ? '0' : s;
}

/** Paint `label` right-aligned at (x, y) over a paper box so grid dots don't cross the numerals. */
function knockoutText(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  fontPx: number,
  paper: string,
  ink: string,
) {
  const w = ctx.measureText(label).width;
  ctx.fillStyle = paper;
  ctx.fillRect(x - w - 2, y - fontPx / 2 - 1, w + 4, fontPx + 2);
  ctx.fillStyle = ink;
  ctx.fillText(label, x, y);
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
    paper = theme.paper,
    camera,
  }: GridMarkersOptions,
) {
  if (camera) {
    drawZoomGrid(ctx, camera, {
      width, height, margin, subdivisions, ruler, rulerInset, frameRadius, ink, paper,
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
    const minorTick = longTick * 0.3;
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
      // Bar runs flush from the first to the last graduation tick of the row
      const firstY = top + inset + 0.5 * divH;
      const lastY = top + inset + (rulerDivisions - 0.5) * divH;
      ctx.fillRect(barX, firstY - ctx.lineWidth / 2, barW, lastY - firstY + ctx.lineWidth);
      ctx.beginPath();
      for (let d = 0; d < rulerDivisions; d++) {
        const cy = top + inset + (d + 0.5) * divH;
        const idx = rulerOrigin === 'top' ? d + 1 : rulerDivisions - d;
        knockoutText(ctx, pad2(idx), numX, cy, subFont, paper, ink);
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
  paper: string;
  xLabels: 'numbers' | 'letters';
  yLabels: 'numbers' | 'letters';
}

/** Camera-driven grid: world-anchored lines, value labels on the lines, value graduations. */
function drawZoomGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  { width, height, margin, subdivisions, ruler, rulerInset, frameRadius, ink, paper, xLabels, yLabels }: ZoomGridOptions,
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
    // Unlabelled ticks between labels: the largest nice step ≤ 24 px that divides `sub`; at least the midpoint
    const fine = niceStepFloor(24 / scale);
    const perLabel = Math.abs(sub / fine - Math.round(sub / fine)) < 1e-9 ? Math.max(2, Math.round(sub / fine)) : 2;
    const finePx = subPx / perLabel;
    // Breathing room from each row boundary: half a label step, but never more than one fine tick
    const inset = rulerInset ?? Math.min(subPx * 0.5, finePx);
    // When the label step equals the major step, the only labellable values sit on the major lines
    const labelsOnMajors = sub >= step - 1e-9;
    const numX = x1 + rulerW * 0.52;
    const tickX = x1 + rulerW * 0.56;
    const longTick = rulerW * 0.18;
    const shortTick = longTick * 0.5;
    const minorTick = longTick * 0.3;
    const barX = x1 + rulerW * 0.74;
    const barW = rulerW * 0.14;
    const distToMajorPx = (v: number) => {
      const m = ((v % step) + step) % step;
      return Math.min(m, step - m) * scale;
    };
    const subFont = Math.min(11, Math.max(7, subPx * 0.55));
    ctx.font = labelFont(subFont, 400);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.25;
    // Track the screen extent of each major row's ticks so the bar can run flush with them
    const rowExtent = new Map<number, { min: number; max: number }>();
    const noteTick = (v: number, y: number) => {
      if (distToMajorPx(v) < inset - 1e-6) return; // ticks on/near a major line don't extend a bar
      const row = Math.floor(v / step + 1e-9);
      const e = rowExtent.get(row);
      if (!e) rowExtent.set(row, { min: y, max: y });
      else {
        e.min = Math.min(e.min, y);
        e.max = Math.max(e.max, y);
      }
    };
    ctx.beginPath();
    for (const k of range(vis.y - step, vis.y + vis.h + step, sub)) {
      const v = k * sub;
      const y = sy(v);
      if (labelsOnMajors || distToMajorPx(v) >= inset - 1e-6) {
        if (inFrameY(y)) {
          knockoutText(ctx, formatValue(v, sub), numX, y, subFont, paper, ink);
          ctx.moveTo(tickX, y);
          ctx.lineTo(tickX + longTick, y);
        }
        noteTick(v, y);
      }
      for (let j = 1; j < perLabel; j++) {
        const vj = v + (j * sub) / perLabel;
        const yj = sy(vj);
        if (distToMajorPx(vj) < inset - 1e-6) continue;
        noteTick(vj, yj);
        if (!inFrameY(yj)) continue;
        const len = perLabel % 2 === 0 && j === perLabel / 2 ? shortTick : minorTick;
        ctx.moveTo(tickX + longTick - len, yj);
        ctx.lineTo(tickX + longTick, yj);
      }
    }
    ctx.stroke();
    // Bars: one per major row, flush with the row's first and last tick (clipped by the frame)
    const lw = ctx.lineWidth;
    for (const { min, max } of rowExtent.values()) {
      ctx.fillRect(barX, min - lw / 2, barW, max - min + lw);
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
