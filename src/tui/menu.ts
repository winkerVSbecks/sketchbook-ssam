/**
 * Settings as a popup menu: a chrome-less panel of glyph controls hung off a
 * bar item — flush left with the item's span, its bottom row directly above a
 * bottom band (or its top row directly below a top band). The single-line
 * frame uses the bar's colours so the panel reads as part of the bar. No title
 * row, no buttons, not draggable or resizable. The desktop keeps it out of the
 * window z-order (always in front, never a Tab stop) and dismisses it on a
 * click outside, `Esc`, or the item itself.
 *
 * Pure cell logic apart from `metrics.toCell`; `draw(buf)` paints into a
 * `GlyphBuffer` and the `UIWindow.draw(ctx)` overload is a no-op.
 */
import type { Cursor, Pt, UIWindow } from '../ui';
import { cellRect, cellRectContains, insetCellRect, type Cell, type CellRect } from './cells';
import { createControlHost, type LayoutPadding, type TuiControl } from './controls';
import type { GlyphBuffer } from './grid';
import type { TuiMetrics } from './metrics';
import type { TuiTheme } from './theme';

export interface PopupAnchor {
  /** First column of the bar item's span: the menu's left edge (clamped into the bounds). */
  col: number;
  /** The row the menu must not enter: the band's first row (`above`) or the first row after the band (`below`). */
  row: number;
  /** Which side of `row` the menu hangs on — `above` for a bottom bar, `below` for a top bar. */
  side: 'above' | 'below';
}

export interface PopupMenuOptions {
  metrics: TuiMetrics;
  theme: TuiTheme;
  controls: readonly TuiControl[];
  /** Where to hang, evaluated on every layout (the bar re-lays out on resize). */
  anchor: () => PopupAnchor;
  /** Area the menu must stay inside (the desktop area), evaluated on every layout. */
  bounds: () => CellRect;
  /** Width available to the controls, in cells (default 32); padding and the frame are added on top. */
  cols?: number;
  /** Breathing space between the frame and the controls (default 1 row / 2 cols). */
  padding?: LayoutPadding;
}

export interface TuiPopupMenu extends UIWindow {
  visible: boolean;
  readonly controls: readonly TuiControl[];
  /** Outer rect, frame included; laid out from the anchor on every read. */
  readonly rect: CellRect;
  /** `rect` minus the 1-cell frame. */
  readonly inner: CellRect;
  open(): void;
  close(): void;
  toggle(): void;
  /** Paint frame + controls into the buffer. `UIWindow.draw(ctx)` is a no-op. */
  draw(buf: GlyphBuffer): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export const DEFAULT_POPUP_COLS = 32;
export const DEFAULT_POPUP_PADDING: Required<LayoutPadding> = { rows: 1, cols: 2 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const resolvePadding = (padding: number | LayoutPadding): Required<LayoutPadding> =>
  typeof padding === 'number'
    ? { rows: padding, cols: padding }
    : { rows: padding.rows ?? 0, cols: padding.cols ?? 0 };

/**
 * Pure geometry: size the menu to its controls (stacked with one blank row
 * between, plus `padding` on every side and the 1-cell frame), never larger
 * than `bounds`, and hang it off `anchor` — left edge on the anchor column,
 * slid inside `bounds` when it would overhang. `innerCols` is the width the
 * controls get.
 */
export function popupMenuRect(
  controls: readonly TuiControl[],
  innerCols: number,
  anchor: PopupAnchor,
  bounds: CellRect,
  padding: number | LayoutPadding = 0,
): CellRect {
  const pad = resolvePadding(padding);
  const innerRows = controls.reduce((sum, c, i) => sum + c.rows(innerCols) + (i > 0 ? 1 : 0), 0);
  const cols = Math.min(bounds.cols, innerCols + 2 * pad.cols + 2);
  const rows = Math.min(bounds.rows, innerRows + 2 * pad.rows + 2);
  const row = anchor.side === 'above' ? anchor.row - rows : anchor.row;
  return cellRect(
    clamp(row, bounds.row, Math.max(bounds.row, bounds.row + bounds.rows - rows)),
    clamp(anchor.col, bounds.col, Math.max(bounds.col, bounds.col + bounds.cols - cols)),
    rows,
    cols,
  );
}

export function createPopupMenu(opts: PopupMenuOptions): TuiPopupMenu {
  const { metrics, controls } = opts;
  const padding: Required<LayoutPadding> = {
    rows: opts.padding?.rows ?? DEFAULT_POPUP_PADDING.rows,
    cols: opts.padding?.cols ?? DEFAULT_POPUP_PADDING.cols,
  };
  const host = createControlHost(controls, padding);
  const rect = (): CellRect =>
    popupMenuRect(controls, opts.cols ?? DEFAULT_POPUP_COLS, opts.anchor(), opts.bounds(), padding);
  const inner = (): CellRect => insetCellRect(rect(), 1);
  const inRect = (cell: Cell): boolean => cellRectContains(rect(), cell.row, cell.col);
  /** Between a pointerDown inside and its pointerUp. */
  let captured = false;

  const menu: TuiPopupMenu = {
    visible: false,
    controls,
    get rect() {
      return rect();
    },
    get inner() {
      return inner();
    },
    open() {
      menu.visible = true;
    },
    close() {
      menu.visible = false;
    },
    toggle() {
      menu.visible = !menu.visible;
    },

    contains: (pt: Pt) => menu.visible && inRect(metrics.toCell(pt)),

    pointerDown(pt: Pt) {
      const cell = metrics.toCell(pt);
      if (!menu.visible || !inRect(cell)) return false;
      captured = true;
      return host.pointerDown(cell, inner());
    },
    pointerMove(pt: Pt) {
      if (!menu.visible) return false;
      // Forwarded even outside the rect so the host can drop its hover state.
      return host.pointerMove(metrics.toCell(pt), inner());
    },
    pointerUp(pt: Pt) {
      if (!captured) return false;
      captured = false;
      return host.pointerUp(metrics.toCell(pt), inner());
    },
    cursorAt(pt: Pt): Cursor | null {
      if (!menu.visible) return null;
      const cell = metrics.toCell(pt);
      if (!captured && !inRect(cell)) return null;
      return host.cursorAt(cell, inner()) ?? 'default';
    },

    draw(target: GlyphBuffer | CanvasRenderingContext2D) {
      // UIWindow.draw(ctx) is a no-op: the desktop paints via draw(buf) + one blit.
      if (!('put' in target)) return;
      if (!menu.visible) return;
      const buf = target;
      const t = opts.theme;
      const r = rect();
      if (r.rows < 2 || r.cols < 2) return;
      buf.fill(r, ' ', t.fg, t.bg);
      // The frame is the bar's own pair, so the panel reads as a flap of the bar.
      buf.box(r, 'single', t.chromeFg, t.chromeBg);
      const i = inner();
      if (i.rows > 0 && i.cols > 0) buf.clip(i, () => host.draw(buf, i, t));
    },
  };
  return menu;
}
