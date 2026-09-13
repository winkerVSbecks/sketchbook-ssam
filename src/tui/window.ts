/**
 * A window positioned and sized in cells, hosted by `createUI` from `src/ui`.
 *
 * Chrome is all glyphs (theme.frame / theme.frameActive): a 1-cell box frame whose top row doubles as the title
 * row — ` title ` inset at the left, `[–][□][×]` (minimize, maximize, close)
 * at the right end — and whose bottom-right corner is the resize grip. The
 * front window uses the 'double' box style, others 'single'. Double-clicking
 * the title row (two presses within `doubleClickMs`, one cell apart at most)
 * toggles maximize like `[□]`; the pointer plumbing has no dblclick event.
 *
 * Pointer methods take pixel points (the `UIWindow` contract) and convert to
 * cells through `metrics.toCell`; drags snap to whole cells and stay inside
 * the desktop `bounds`. Pure logic — only `draw(buf)` paints, into a
 * `GlyphBuffer`; the `UIWindow.draw(ctx)` is a no-op.
 */
import type { Cursor, PointerMods, Pt, UIWindow } from '../ui';
import { cellRectContains, insetCellRect, type Cell, type CellRect } from './cells';
import { BOX, type GlyphBuffer } from './grid';
import type { TuiMetrics } from './metrics';
import { composite, fallbackTheme, legibleOn, type TuiTheme } from './theme';

export type TuiWindowButton = 'minimize' | 'maximize' | 'close';

/**
 * Optional handler for pointer events inside the inner rect, in cell
 * coordinates. `cell` is absolute (buffer) and `inner` is the current inner
 * rect, so content can lay itself out in either frame.
 */
export interface TuiContent {
  pointerDown(cell: Cell, inner: CellRect, mods?: PointerMods): boolean;
  pointerMove(cell: Cell, inner: CellRect, mods?: PointerMods): boolean;
  pointerUp(cell: Cell, inner: CellRect, mods?: PointerMods): boolean;
  cursorAt?(cell: Cell, inner: CellRect): Cursor | null;
}

export interface TuiWindowOptions {
  metrics: TuiMetrics;
  title: string;
  rect: CellRect;
  /** Desktop area the window may occupy (moves/resizes clamp to it; maximize fills it). */
  bounds: CellRect;
  theme?: TuiTheme;
  minRows?: number;
  minCols?: number;
  resizable?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  /** Two title-row presses this close in time toggle maximize (default 350 ms). */
  doubleClickMs?: number;
  /** Clock for double-click timing, in ms (default `performance.now`); injectable for tests. */
  now?: () => number;
  /**
   * Host-wired predicate: when it returns false the window never draws the
   * double frame / highlighted title, whatever `active` says (default: always true).
   */
  activeFrame?: () => boolean;
  /** Paint the body; the buffer is already clipped to `inner`. */
  draw?: (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => void;
  /** Pointer handler for clicks inside the inner rect (e.g. the settings controls). */
  content?: TuiContent;
  onClose?: (win: TuiWindow) => void;
  onMinimize?: (win: TuiWindow) => void;
  onMaximize?: (win: TuiWindow) => void;
}

export interface TuiWindow extends UIWindow {
  readonly rect: CellRect;
  /** `rect` minus the frame (1 col each side, title row on top, border row below). */
  readonly inner: CellRect;
  title: string;
  theme: TuiTheme;
  /** Set by the host: the front window draws a double frame. */
  active: boolean;
  minimized: boolean;
  maximized: boolean;
  /** Desktop area; reassigning re-fits a maximized window. */
  bounds: CellRect;
  content: TuiContent | undefined;
  readonly dragging: 'move' | 'resize' | null;
  restore(): void;
  /** Replace the geometry (min size enforced; clears the maximized state). */
  setRect(rect: CellRect): void;
  toggleMaximize(): void;
  /** Paint frame + chrome + body into the buffer. `UIWindow.draw(ctx)` is a no-op. */
  draw(buf: GlyphBuffer): void;
  draw(ctx: CanvasRenderingContext2D): void;
  /** Which chrome button (if any) sits at an absolute cell. */
  buttonAt(cell: Cell): TuiWindowButton | null;
}

const BUTTON_W = 3;

const buttonGlyph = (b: TuiWindowButton, maximized: boolean): string =>
  b === 'minimize' ? '[–]' : b === 'close' ? '[×]' : maximized ? '[▣]' : '[□]';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createTuiWindow(opts: TuiWindowOptions): TuiWindow {
  const { metrics } = opts;
  const minRows = Math.max(3, opts.minRows ?? 4);
  const minCols = Math.max(3, opts.minCols ?? 12);
  const resizable = opts.resizable ?? true;
  const buttons: TuiWindowButton[] = [];
  if (opts.minimizable ?? true) buttons.push('minimize');
  if (opts.maximizable ?? true) buttons.push('maximize');
  if (opts.closable ?? true) buttons.push('close');

  let rect: CellRect = { ...opts.rect };
  let bounds: CellRect = { ...opts.bounds };
  let savedRect: CellRect | null = null;
  let hoverGrip = false;
  let pressed: TuiWindowButton | null = null;
  let drag: { kind: 'move' | 'resize'; start: Cell; from: CellRect } | null = null;
  /** Last press on the title row (not a button), for double-click detection. */
  let lastTitlePress: { at: number; cell: Cell } | null = null;
  const doubleClickMs = opts.doubleClickMs ?? 350;
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const maximizable = opts.maximizable ?? true;
  let contentCaptured = false;

  const fitSize = (r: CellRect): CellRect => ({
    ...r,
    rows: Math.max(minRows, r.rows),
    cols: Math.max(minCols, r.cols),
  });

  const setRectRaw = (r: CellRect): boolean => {
    const changed =
      r.row !== rect.row || r.col !== rect.col || r.rows !== rect.rows || r.cols !== rect.cols;
    rect = { ...r };
    return changed;
  };

  const top = () => rect.row;
  const bottom = () => rect.row + rect.rows - 1;
  const right = () => rect.col + rect.cols - 1;

  /** Buttons pack against the right end of the title row, just inside the corner. */
  const buttonCol = (i: number): number =>
    right() - BUTTON_W * (buttons.length - i);

  const buttonAt = (cell: Cell): TuiWindowButton | null => {
    if (cell.row !== top()) return null;
    for (let i = 0; i < buttons.length; i++) {
      const c0 = buttonCol(i);
      if (c0 <= rect.col) continue; // no room — button not drawn, not hittable
      if (cell.col >= c0 && cell.col < c0 + BUTTON_W) return buttons[i];
    }
    return null;
  };

  const isGrip = (cell: Cell): boolean =>
    resizable && cell.row === bottom() && cell.col === right();

  const inRect = (cell: Cell): boolean => cellRectContains(rect, cell.row, cell.col);
  const inInner = (cell: Cell): boolean =>
    cellRectContains(insetCellRect(rect, 1), cell.row, cell.col);

  const press = (b: TuiWindowButton) => {
    if (b === 'close') {
      win.visible = false;
      opts.onClose?.(win);
    } else if (b === 'minimize') {
      win.minimized = true;
      win.visible = false;
      opts.onMinimize?.(win);
    } else {
      win.toggleMaximize();
    }
  };

  const win: TuiWindow = {
    visible: true,
    active: false,
    minimized: false,
    maximized: false,
    title: opts.title,
    theme: opts.theme ?? fallbackTheme,
    content: opts.content,

    get rect() {
      return rect;
    },
    get inner() {
      return insetCellRect(rect, 1);
    },
    get bounds() {
      return bounds;
    },
    set bounds(b: CellRect) {
      bounds = { ...b };
      if (win.maximized) setRectRaw(fitSize(bounds));
    },
    get dragging() {
      return drag?.kind ?? null;
    },

    restore() {
      win.minimized = false;
      win.visible = true;
    },

    setRect(r) {
      win.maximized = false;
      savedRect = null;
      setRectRaw(fitSize(r));
    },

    toggleMaximize() {
      if (win.maximized) {
        win.maximized = false;
        if (savedRect) setRectRaw(savedRect);
        savedRect = null;
      } else {
        savedRect = { ...rect };
        win.maximized = true;
        setRectRaw(fitSize(bounds));
      }
      opts.onMaximize?.(win);
    },

    buttonAt,

    contains(pt) {
      return win.visible && inRect(metrics.toCell(pt));
    },

    pointerDown(pt, mods) {
      const cell = metrics.toCell(pt);
      if (!inRect(cell)) return false;
      const b = buttonAt(cell);
      if (b) {
        pressed = b;
        lastTitlePress = null;
        return true;
      }
      if (isGrip(cell)) {
        drag = { kind: 'resize', start: cell, from: { ...rect } };
        hoverGrip = true;
        return true;
      }
      if (cell.row === top()) {
        // Double-click: a second title press within doubleClickMs and one cell of
        // the first toggles maximize (like [□]) instead of starting a move drag.
        const at = now();
        const prev = lastTitlePress;
        const near = prev && Math.abs(cell.row - prev.cell.row) <= 1 && Math.abs(cell.col - prev.cell.col) <= 1;
        if (prev && near && at - prev.at <= doubleClickMs) {
          lastTitlePress = null;
          drag = null;
          if (maximizable) win.toggleMaximize();
          return true;
        }
        lastTitlePress = { at, cell };
        drag = { kind: 'move', start: cell, from: { ...rect } };
        return true;
      }
      if (win.content && inInner(cell)) {
        contentCaptured = true;
        return win.content.pointerDown(cell, win.inner, mods);
      }
      return false;
    },

    pointerMove(pt, mods) {
      const cell = metrics.toCell(pt);
      if (drag) {
        const dr = cell.row - drag.start.row;
        const dc = cell.col - drag.start.col;
        let next: CellRect;
        if (drag.kind === 'move') {
          const { from } = drag;
          next = {
            ...from,
            row: clamp(from.row + dr, bounds.row, Math.max(bounds.row, bounds.row + bounds.rows - from.rows)),
            col: clamp(from.col + dc, bounds.col, Math.max(bounds.col, bounds.col + bounds.cols - from.cols)),
          };
        } else {
          const { from } = drag;
          const maxRows = Math.max(minRows, bounds.row + bounds.rows - from.row);
          const maxCols = Math.max(minCols, bounds.col + bounds.cols - from.col);
          next = {
            ...from,
            rows: clamp(from.rows + dr, minRows, maxRows),
            cols: clamp(from.cols + dc, minCols, maxCols),
          };
        }
        let changed = setRectRaw(next);
        if (win.maximized && (dr !== 0 || dc !== 0)) {
          // Moving or resizing by hand leaves the maximized state; the window
          // keeps its current rect (a bounds-sized window cannot move, only shrink).
          win.maximized = false;
          savedRect = null;
          changed = true;
        }
        return changed;
      }
      if (contentCaptured && win.content) {
        return win.content.pointerMove(cell, win.inner, mods);
      }
      let changed = false;
      const grip = win.visible && isGrip(cell);
      if (grip !== hoverGrip) {
        hoverGrip = grip;
        changed = true;
      }
      // Forward moves even outside inner so content can reset hover states.
      if (win.content && win.visible) {
        changed = win.content.pointerMove(cell, win.inner, mods) || changed;
      }
      return changed;
    },

    pointerUp(pt, mods) {
      const cell = metrics.toCell(pt);
      if (pressed) {
        const b = pressed;
        pressed = null;
        if (buttonAt(cell) === b) press(b);
        return true;
      }
      if (drag) {
        drag = null;
        hoverGrip = isGrip(cell);
        return true;
      }
      if (contentCaptured && win.content) {
        contentCaptured = false;
        return win.content.pointerUp(cell, win.inner, mods);
      }
      contentCaptured = false;
      return false;
    },

    cursorAt(pt) {
      const cell = metrics.toCell(pt);
      if (drag) return drag.kind === 'move' ? 'move' : 'nwse-resize';
      if (!inRect(cell)) return null;
      if (buttonAt(cell)) return 'pointer';
      if (isGrip(cell)) return 'nwse-resize';
      if (cell.row === top()) return 'move';
      if (win.content && inInner(cell)) return win.content.cursorAt?.(cell, win.inner) ?? null;
      return null;
    },

    draw(target: GlyphBuffer | CanvasRenderingContext2D) {
      // UIWindow.draw(ctx) is a no-op: the desktop paints via draw(buf) + one blit.
      if (!('put' in target)) return;
      const buf = target;
      if (!win.visible) return;
      const t = win.theme;
      const highlight = win.active && (opts.activeFrame?.() ?? true);
      const style = highlight ? 'double' : 'single';
      // Both frame colours are solid and ≥ 4.5:1 against bg (see theme.ts).
      const frameFg = highlight ? t.frameActive : t.frame;

      buf.fill(rect, ' ', t.fg, t.bg);
      buf.box(rect, style, frameFg, t.bg);

      // Title, inset one cell past the corner, truncated before the buttons.
      const firstButtonCol = buttons.length ? buttonCol(0) : right();
      const titleCol = rect.col + 2;
      const room = firstButtonCol - 1 - titleCol;
      if (room > 0) {
        const label = ` ${win.title} `;
        // The highlighted title keeps text-level AA against its real ground
        // (chromeBg may be translucent, as in fallbackTheme: flatten it over bg first).
        if (highlight) buf.text(top(), titleCol, label, legibleOn(composite(t.chromeBg, t.bg), t.chromeFg, t.frameActive), t.chromeBg, room);
        else buf.text(top(), titleCol, label, t.frame, t.bg, room);
      }

      for (let i = 0; i < buttons.length; i++) {
        const c0 = buttonCol(i);
        if (c0 <= rect.col) continue;
        const b = buttons[i];
        const bg = pressed === b ? t.selectionBg : t.bg;
        // selectionBg is translucent: measure against it flattened over bg.
        const fg = pressed === b ? legibleOn(composite(bg, t.bg), frameFg, t.frameActive) : frameFg;
        buf.text(top(), c0, buttonGlyph(b, win.maximized), fg, bg, BUTTON_W);
      }

      if (resizable) {
        const grip = hoverGrip || drag?.kind === 'resize' ? '◢' : BOX[style].br;
        buf.put(bottom(), right(), grip, frameFg, t.bg);
      }

      const inner = win.inner;
      if (opts.draw && inner.rows > 0 && inner.cols > 0) {
        buf.clip(inner, () => opts.draw!(buf, inner, win));
      }
    },
  };

  setRectRaw(fitSize(rect));
  return win;
}
