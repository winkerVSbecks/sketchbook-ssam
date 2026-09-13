import type { Cursor, Pt, UIWindow } from '../ui';
import type { CellRect } from './cells';
import { cellRect } from './cells';
import type { GlyphBuffer } from './grid';
import type { TuiMetrics } from './metrics';
import { composite, legibleOn, type TuiTheme } from './theme';

/**
 * One entry on the system bar. The desktop supplies them: first `≡ settings`
 * (`active` while the settings window is visible), then one per minimized
 * window (selecting it restores the window).
 */
export interface MenuItem {
  id: string;
  label: string;
  /** Drawn inverted: `chromeBg` text on a `chromeFg` ground (same contrast pair as the bar). */
  active?: boolean;
  onSelect: () => void;
}

export interface MenuBarOptions {
  metrics: TuiMetrics;
  theme: TuiTheme;
  /** Width of the bar in cells (a getter lets the desktop resize). */
  cols: number | (() => number);
  /** First buffer row of the bar band — the bottom `rows` rows by default, but any edge works. */
  row: number | (() => number);
  /** Height of the band in rows (default 2): the ground fills every row; the text sits on the upper row with `dy` centring it on the band. */
  rows?: number;
  /** Current items, queried on every layout/draw/hit-test. */
  items: () => MenuItem[];
  /** Optional right-aligned status text (seed, fps…). Truncated before it would overlap items. */
  status?: () => string;
}

/** A laid-out item: `col`/`cols` is the hit-testable span (label + one cell of padding each side). */
export interface MenuSpan {
  item: MenuItem;
  /** First cell of the (possibly truncated) label. */
  labelCol: number;
  label: string;
  col: number;
  cols: number;
}

export interface MenuBarLayout {
  spans: MenuSpan[];
  /** Right-aligned status, or null when there is no room / no text. */
  status: { col: number; text: string } | null;
}

export interface TuiMenuBar extends UIWindow {
  /** The band's first row in the buffer (evaluated now); the text sits on it. */
  readonly row: number;
  /** Height of the band in rows. */
  readonly rows: number;
  /** The bar's width in cells (evaluated now). */
  readonly cols: number;
  rect(): CellRect;
  layout(): MenuBarLayout;
  /** Item whose span covers buffer column `col`, or null. */
  itemAtCol(col: number): MenuItem | null;
  /** Item under a pixel point, or null. */
  itemAt(pt: Pt): MenuItem | null;
  /** Paint the bar into the glyph buffer (reverse-video band). */
  paint(buf: GlyphBuffer): void;
}

/** ` │ ` between items. */
export const MENU_SEPARATOR = ' │ ';
/** Leading/trailing padding cell on each side of the bar. */
const PAD = 1;

const chars = (s: string): string[] => Array.from(s);
const len = (s: string): number => chars(s).length;
const head = (s: string, n: number): string => chars(s).slice(0, Math.max(0, n)).join('');

/**
 * Pure layout: place items left-to-right from column `PAD`, separated by
 * `MENU_SEPARATOR`; drop items that no longer fit (the last visible one is
 * truncated to the remaining width); right-align `status`, shortening it so
 * it never overlaps the items.
 */
export function layoutMenuBar(
  items: readonly MenuItem[],
  cols: number,
  status?: string,
): MenuBarLayout {
  const spans: MenuSpan[] = [];
  const limit = cols - PAD; // exclusive last usable column for labels
  let cursor = PAD;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const start = i === 0 ? cursor : cursor + MENU_SEPARATOR.length;
    const room = limit - start;
    if (room < 1) break;
    const label = head(item.label, room);
    const n = len(label);
    spans.push({
      item,
      label,
      labelCol: start,
      col: start - 1,
      cols: n + 2,
    });
    cursor = start + n;
  }

  let statusOut: MenuBarLayout['status'] = null;
  if (status && cols > 2 * PAD) {
    // Leave one blank cell between the last item's span and the status.
    const itemsEnd = spans.length ? spans[spans.length - 1].col + spans[spans.length - 1].cols : PAD;
    const room = cols - PAD - itemsEnd - (spans.length ? 1 : 0);
    if (room >= 1) {
      const text = head(status, room);
      statusOut = { col: cols - PAD - len(text), text };
    }
  }
  return { spans, status: statusOut };
}

export function createMenuBar(opts: MenuBarOptions): TuiMenuBar {
  const { metrics, theme, items, status } = opts;
  const getCols = () => Math.max(0, Math.floor(typeof opts.cols === 'function' ? opts.cols() : opts.cols));
  const getRow = () => Math.floor(typeof opts.row === 'function' ? opts.row() : opts.row);
  const getRows = () => Math.max(1, Math.floor(opts.rows ?? 2));

  /** Id of the item the pointer went down on; selection fires on `pointerUp` over the same item. */
  let pressed: string | null = null;

  const rect = (): CellRect => cellRect(getRow(), 0, getRows(), getCols());
  const layout = (): MenuBarLayout => layoutMenuBar(items(), getCols(), status?.());

  const spanAtCol = (col: number): MenuSpan | null => {
    for (const s of layout().spans) {
      if (col >= s.col && col < s.col + s.cols) return s;
    }
    return null;
  };
  const itemAtCol = (col: number): MenuItem | null => spanAtCol(col)?.item ?? null;

  const inBar = (pt: Pt): boolean => {
    const c = metrics.toCell(pt);
    const row = getRow();
    return c.row >= row && c.row < row + getRows() && c.col >= 0 && c.col < getCols();
  };
  const itemAt = (pt: Pt): MenuItem | null =>
    inBar(pt) ? itemAtCol(metrics.toCell(pt).col) : null;

  /** Text is written on the upper row, shifted down so its em box is centred on the band's midline (0 for a 1-row bar). */
  const textDy = () => (getRows() - 1) / 2;

  const paint = (buf: GlyphBuffer) => {
    const r = rect();
    if (r.cols < 1) return;
    const dy = textDy();
    buf.fill(r, ' ', theme.chromeFg, theme.chromeBg);
    const { spans, status: st } = layout();
    // Separators first: their padding spaces overlap the items' pad cells, and an
    // active item's inversion must win those cells.
    spans.forEach((s, i) => {
      if (i > 0) buf.text(r.row, s.labelCol - MENU_SEPARATOR.length, MENU_SEPARATOR, theme.chromeFg, theme.chromeBg, undefined, dy);
    });
    spans.forEach((s) => {
      // Active: inverted over the whole span (label + one pad cell each side), so
      // its contrast is the bar's own pair — `accent` never reaches the bar.
      // Pressed: the translucent selectionBg, with text kept at AA on the flattened
      // ground (bg ← chromeBg ← selectionBg; chromeBg itself may be translucent).
      const isPressed = pressed === s.item.id;
      const bg = s.item.active ? theme.chromeFg : isPressed ? theme.selectionBg : theme.chromeBg;
      const fg = s.item.active
        ? theme.chromeBg
        : isPressed
          ? legibleOn(composite(bg, composite(theme.chromeBg, theme.bg)), theme.chromeFg, theme.frameActive)
          : theme.chromeFg;
      // Highlights cover the whole band, not just the text row.
      if (s.item.active || isPressed) buf.fill(cellRect(r.row, s.col, r.rows, s.cols), ' ', fg, bg);
      buf.text(r.row, s.labelCol, s.label, fg, bg, undefined, dy);
    });
    if (st) buf.text(r.row, st.col, st.text, theme.chromeFg, theme.chromeBg, undefined, dy);
  };

  return {
    visible: true,
    get row() {
      return getRow();
    },
    get cols() {
      return getCols();
    },
    get rows() {
      return getRows();
    },
    rect,
    layout,
    itemAtCol,
    itemAt,
    paint,
    contains: inBar,
    /** The desktop paints via `paint(buf)` and blits the buffer once; nothing to do per-window. */
    draw: () => {},
    pointerDown(pt) {
      if (!inBar(pt)) return false;
      pressed = itemAt(pt)?.id ?? null;
      return pressed !== null;
    },
    pointerMove() {
      return false;
    },
    pointerUp(pt) {
      const was = pressed;
      pressed = null;
      if (was === null) return false;
      const item = itemAt(pt);
      if (item && item.id === was) {
        item.onSelect();
        return true;
      }
      return true; // released elsewhere: the pressed highlight goes away
    },
    cursorAt(pt): Cursor | null {
      if (!inBar(pt)) return null;
      return itemAt(pt) ? 'pointer' : 'default';
    },
  };
}
