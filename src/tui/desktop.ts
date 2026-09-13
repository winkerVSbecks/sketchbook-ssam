/**
 * The terminal desktop: the one call a sketch makes. Wires the glyph buffer,
 * metrics and theme to `createUI` (z-order + capture, reused from `src/ui`),
 * hosts `TuiWindow`s inside the desktop area, draws the system menu bar on the
 * bottom (or top) rows and, when configured, the `≡ settings` popup menu — a
 * chrome-less panel of glyph controls hung off its bar item (see ./menu).
 *
 * Pointer events go to the open popup first (a click outside dismisses it),
 * then to the bar, then to the window manager; the popup is painted over the
 * windows and the bar last so nothing can cover it. `render()` clears the buffer, paints
 * wallpaper → windows (back-to-front) → bar, then blits once. Everything but
 * the blit is pure cell logic, so the desktop runs headless with a stub ctx.
 *
 * The grid follows the canvas: `resize(width, height)` rebuilds the buffer,
 * moves the bar and re-clamps every window into the new area. A bottom bar's
 * band runs flush to the canvas edge — the `height − rows · lineH` remainder
 * is painted as part of it, not left as a bare strip.
 */
import { attachPointer, createUI } from '../ui';
import type { Cursor, PointerMods, PointerTarget, Pt, UI } from '../ui';

import { cellRect, type CellRect } from './cells';
import type { LayoutPadding, TuiControl } from './controls';
import { createGlyphBuffer, type BlitContext, type GlyphBuffer } from './grid';
import { createPopupMenu, type PopupAnchor, type TuiPopupMenu } from './menu';
import { createMenuBar, type MenuItem, type TuiMenuBar } from './menubar';
import { createMetrics, type TextMeasurer, type TuiMetrics } from './metrics';
import { composite, fallbackTheme, themeFromPalette, type TuiTheme } from './theme';
import { createTuiWindow, type TuiWindow, type TuiWindowOptions } from './window';

/** What the desktop needs from a 2D context: glyph measuring + the blit. `CanvasRenderingContext2D` satisfies it. */
export type DesktopContext = BlitContext & TextMeasurer;

/** Per-window options a sketch supplies; metrics, bounds and theme are filled in by the desktop. */
export type DesktopWindowOptions = Omit<TuiWindowOptions, 'metrics' | 'bounds' | 'theme'> & {
  theme?: TuiTheme;
};

/** The `≡ settings` popup: sized to its controls, anchored to its bar item (see `createPopupMenu`). */
export interface DesktopSettingsOptions {
  controls: TuiControl[];
  /** Start open (default false). */
  open?: boolean;
  /** Width available to the controls, in cells (default 32); padding and the frame are added on top. */
  cols?: number;
  /** Breathing space between the frame and the controls (default 1 row / 2 cols). */
  padding?: LayoutPadding;
}

export interface DesktopOptions {
  ctx: DesktopContext;
  /** Omit for headless use (node tests): no pointer or keyboard listeners are attached. */
  canvas?: HTMLCanvasElement;
  /** Initial canvas size in logical pixels; `resize()` updates it. */
  width: number;
  height: number;
  /** Sketch palette (`palette[0]` = background) mapped through `themeFromPalette`… */
  palette?: readonly string[];
  /** …or a ready-made theme (wins over `palette`). */
  theme?: TuiTheme;
  font?: { size?: number; lineH?: number; family?: string; charW?: number };
  /** Which edge the two-row system bar lives on; the desktop area is the rest. Default `bottom` (taskbar-style). */
  menuBar?: 'top' | 'bottom';
  settings?: DesktopSettingsOptions;
  /** Right-aligned status text on the bar (seed, fps…). */
  status?: () => string;
  /** When given, the bar starts with a `+ new` item (left of `≡ settings`) that calls this. */
  onNewWindow?: () => void;
  /** Paint the desktop background inside `area` before the windows. */
  wallpaper?: (buf: GlyphBuffer, area: CellRect) => void;
  /** Draw the front window with the double frame + highlighted title (default true). */
  activeFrame?: boolean;
  /** Called whenever the UI changes something — wire to `props.render`. */
  onChange: () => void;
  /** Called when a pointer interaction ends (a window or bar item releases the pointer). */
  onDragEnd?: () => void;
}

export interface Desktop extends PointerTarget {
  readonly metrics: TuiMetrics;
  /** Glyph buffer for the current size (a fresh one after a `resize` that changes rows/cols). */
  readonly buffer: GlyphBuffer;
  /** Current canvas size in logical pixels. */
  readonly width: number;
  readonly height: number;
  readonly ui: UI;
  readonly theme: TuiTheme;
  readonly menuBar: TuiMenuBar;
  /** Desktop area in cells: the whole buffer minus the bar band (`BAR_ROWS` rows). Updated in place by `resize`. */
  readonly area: CellRect;
  /** Sketch windows in z-order (back → front). */
  readonly windows: TuiWindow[];
  /** The settings popup when configured: outside the z-order, drawn in front of every window, never a Tab stop. */
  readonly settings: TuiPopupMenu | null;
  /** True while the popup, the bar or a window holds the pointer. */
  readonly dragging: boolean;
  /** Whether the front window shows the double frame; `active` is still stamped on it. */
  activeFrame: boolean;
  /**
   * Retint in place: updates the shared `theme` object (a palette array goes
   * through `themeFromPalette`) so every window, the bar and the render pass
   * pick it up on the next frame. Returns `theme`. Font metrics are not re-measured.
   */
  setTheme(theme: TuiTheme | readonly string[]): TuiTheme;
  addWindow(opts: DesktopWindowOptions): TuiWindow;
  removeWindow(win: TuiWindow): void;
  toggleSettings(): void;
  /** Restore every minimized window (what the `h` key does). */
  restoreAll(): void;
  /**
   * Keyboard entry point (the DOM listener calls it; tests call it directly):
   * `Escape` closes the settings popup, `h` restores every minimized window,
   * `Tab` fronts the next visible window in z-order and `Shift+Tab` the previous
   * one (wrapping, minimized and closed windows skipped, the popup closed first).
   * Returns true when the key did something.
   */
  keyDown(key: string, mods?: { shiftKey?: boolean }): boolean;
  /**
   * Follow the canvas: recompute rows/cols and the area, move the bar, re-clamp
   * every window into the new area (maximized windows re-fit). Wire to `wrap.resize`.
   */
  resize(width: number, height: number): void;
  /** Paint one frame: bg, wallpaper, windows back-to-front, bar; blit. */
  render(): void;
  dispose(): void;
}

const SETTINGS_ID = '≡ settings';
const NEW_ID = 'new';
const NEW_LABEL = '+ new';
/** Height of the menu bar band in rows (text on the upper row). */
export const BAR_ROWS = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createDesktop(opts: DesktopOptions): Desktop {
  const { ctx, onChange, onDragEnd } = opts;
  let width = opts.width;
  let height = opts.height;
  const theme: TuiTheme = opts.theme ?? (opts.palette ? themeFromPalette(opts.palette) : { ...fallbackTheme });
  const metrics = createMetrics(ctx, {
    fontSize: opts.font?.size,
    lineH: opts.font?.lineH,
    family: opts.font?.family ?? theme.font,
    charW: opts.font?.charW,
  });
  let buffer = createGlyphBuffer(metrics.rows(height), metrics.cols(width));

  const barSide = opts.menuBar ?? 'bottom';
  const barRow = () => (barSide === 'bottom' ? Math.max(0, buffer.rows - BAR_ROWS) : 0);
  /** A bottom band reaches the canvas edge: its pixel height includes the remainder below the last row. */
  const bandPx = () => (barSide === 'bottom' ? Math.max(0, height - barRow() * metrics.lineH) : BAR_ROWS * metrics.lineH);
  /** One stable object (windows and sketches hold references); `layoutArea` updates it in place. */
  const area: CellRect = cellRect(0, 0, 0, 0);
  const layoutArea = () => {
    const areaRows = Math.max(0, buffer.rows - BAR_ROWS);
    Object.assign(area, barSide === 'bottom' ? cellRect(0, 0, areaRows, buffer.cols) : cellRect(BAR_ROWS, 0, areaRows, buffer.cols));
  };
  layoutArea();

  const ui = createUI({ onDragEnd: () => onDragEnd?.() });
  const size = (): [number, number] => [width, height];
  let activeFrame = opts.activeFrame ?? true;
  const showActiveFrame = () => activeFrame;

  const setTheme = (next: TuiTheme | readonly string[]): TuiTheme => {
    const resolved = Array.isArray(next) ? themeFromPalette(next as readonly string[]) : (next as TuiTheme);
    Object.assign(theme, resolved);
    return theme;
  };

  // --- Windows ---------------------------------------------------------------
  const tuiWindows = (): TuiWindow[] => ui.windows as TuiWindow[];
  /** Stable ids for bar items — z-order changes must not confuse press/release matching. */
  const ids = new Map<TuiWindow, number>();
  let nextId = 0;
  const idOf = (w: TuiWindow): string => {
    let id = ids.get(w);
    if (id === undefined) ids.set(w, (id = nextId++));
    return `win:${id}`;
  };

  const addWindow = (o: DesktopWindowOptions): TuiWindow => {
    const win = createTuiWindow({
      ...o,
      metrics,
      bounds: area,
      theme: o.theme ?? theme,
      activeFrame: o.activeFrame ?? showActiveFrame,
    });
    ui.add(win);
    return win;
  };

  const raise = (win: TuiWindow) => {
    win.restore();
    ui.bringToFront(win);
  };

  // --- Settings popup ----------------------------------------------------------
  /** Hangs off the `≡ settings` span: flush left with it, on the band's desktop side. */
  const settingsAnchor = (): PopupAnchor => {
    const span = menuBar.layout().spans.find((sp) => sp.item.id === SETTINGS_ID);
    return barSide === 'bottom'
      ? { col: span?.col ?? 0, row: area.row + area.rows, side: 'above' }
      : { col: span?.col ?? 0, row: area.row, side: 'below' };
  };
  let settings: TuiPopupMenu | null = null;
  if (opts.settings) {
    const s = opts.settings;
    settings = createPopupMenu({
      metrics,
      theme,
      controls: s.controls,
      cols: s.cols,
      padding: s.padding,
      anchor: settingsAnchor,
      bounds: () => area,
    });
    settings.visible = s.open ?? false;
  }

  const toggleSettings = () => settings?.toggle();

  const restoreAll = () => {
    for (const w of tuiWindows()) if (w.minimized) w.restore();
  };

  /**
   * Tab order is z-order: the front window is last, so "next" wraps to the
   * back-most visible window and "previous" sends the front one to the back
   * (the window just under it becomes the front). Settings is not a stop.
   */
  const cycleFocus = (dir: 1 | -1) => {
    settings?.close();
    const stops = tuiWindows().filter((w) => w.visible && !w.minimized);
    if (stops.length < 2) return;
    if (dir === 1) {
      ui.bringToFront(stops[0]);
    } else {
      const front = stops[stops.length - 1];
      ui.windows.splice(ui.windows.indexOf(front), 1);
      ui.windows.unshift(front);
    }
  };

  const keyDown = (key: string, mods?: { shiftKey?: boolean }): boolean => {
    if (key === 'Tab') {
      cycleFocus(mods?.shiftKey ? -1 : 1);
      return true;
    }
    if (key === 'Escape' && settings?.visible) {
      settings.close();
      return true;
    }
    if (key === 'h') {
      restoreAll();
      return true;
    }
    return false;
  };

  /** Keep a window inside the (new) area: shrink to fit, then slide back in. */
  const clampIntoArea = (w: TuiWindow) => {
    const r = w.rect;
    const rows = Math.min(r.rows, Math.max(1, area.rows));
    const cols = Math.min(r.cols, Math.max(1, area.cols));
    const row = clamp(r.row, area.row, Math.max(area.row, area.row + area.rows - rows));
    const col = clamp(r.col, area.col, Math.max(area.col, area.col + area.cols - cols));
    if (row !== r.row || col !== r.col || rows !== r.rows || cols !== r.cols) w.setRect(cellRect(row, col, rows, cols));
  };

  const resize = (w: number, h: number) => {
    width = w;
    height = h;
    const rows = metrics.rows(h);
    const cols = metrics.cols(w);
    if (rows !== buffer.rows || cols !== buffer.cols) buffer = createGlyphBuffer(rows, cols);
    layoutArea();
    for (const win of tuiWindows()) {
      win.bounds = area; // re-fits a maximized window
      if (!win.maximized) clampIntoArea(win);
    }
  };

  // --- Menu bar ----------------------------------------------------------------
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [];
    if (opts.onNewWindow) list.push({ id: NEW_ID, label: NEW_LABEL, onSelect: opts.onNewWindow });
    if (settings) {
      list.push({ id: SETTINGS_ID, label: SETTINGS_ID, active: settings.visible, onSelect: toggleSettings });
    }
    for (const w of tuiWindows()) {
      if (w.minimized) list.push({ id: idOf(w), label: w.title, onSelect: () => raise(w) });
    }
    return list;
  };
  // The bar band spans the whole canvas width, not just `cols` cells.
  const menuBar = createMenuBar({
    metrics,
    theme,
    cols: () => buffer.cols,
    row: barRow,
    rows: BAR_ROWS,
    bandPx,
    widthPx: () => width,
    items,
    status: opts.status,
  });

  // --- Composed pointer target: popup, then bar, then the window manager -------
  let barCaptured = false;
  let popupCaptured = false;
  /** The settings popup while it is open, else null. */
  const openMenu = (): TuiPopupMenu | null => (settings?.visible ? settings : null);
  const target: PointerTarget = {
    hitTest: (pt) => !!openMenu()?.contains(pt) || menuBar.contains(pt) || ui.hitTest(pt),
    pointerDown(pt, mods) {
      const menu = openMenu();
      if (menu) {
        if (menu.contains(pt)) {
          popupCaptured = true;
          menu.pointerDown(pt, mods);
          return true;
        }
        // A click outside dismisses the popup. Bar clicks still go through — the
        // item itself toggles on release, `+ new` and minimized items act on a
        // closed menu — while a click on the desktop or a window is spent on the dismissal.
        if (!menuBar.contains(pt)) {
          menu.close();
          return true;
        }
        if (menuBar.itemAt(pt)?.id !== SETTINGS_ID) menu.close();
      }
      if (menuBar.contains(pt)) {
        barCaptured = true;
        return menuBar.pointerDown(pt, mods);
      }
      return ui.pointerDown(pt, mods);
    },
    pointerMove(pt, mods) {
      if (popupCaptured) return settings!.pointerMove(pt, mods);
      if (barCaptured) return menuBar.pointerMove(pt, mods);
      const menu = openMenu();
      const hover = menu && !ui.dragging ? menu.pointerMove(pt, mods) : false;
      return ui.pointerMove(pt, mods) || hover;
    },
    pointerUp(pt, mods) {
      if (popupCaptured) {
        popupCaptured = false;
        const changed = settings!.pointerUp(pt, mods);
        onDragEnd?.();
        return changed;
      }
      if (barCaptured) {
        barCaptured = false;
        const changed = menuBar.pointerUp(pt, mods);
        onDragEnd?.();
        return changed;
      }
      return ui.pointerUp(pt, mods);
    },
    cursorAt(pt): Cursor | null {
      const menu = openMenu();
      if (popupCaptured || (menu && !ui.dragging && !barCaptured && menu.contains(pt))) return settings!.cursorAt(pt);
      if (barCaptured || (!ui.dragging && menuBar.contains(pt))) return menuBar.cursorAt(pt);
      return ui.cursorAt(pt);
    },
  };

  // --- Input (browser only) ----------------------------------------------------
  const disposePointer = opts.canvas ? attachPointer(opts.canvas, target, size, { onChange }) : () => {};

  const onKey = (e: KeyboardEvent) => {
    if (!keyDown(e.key, e)) return;
    // Tab must not move the browser's focus off the canvas.
    if (e.key === 'Tab') e.preventDefault();
    onChange();
  };
  const hasDom = typeof window !== 'undefined' && !!opts.canvas;
  if (hasDom) window.addEventListener('keydown', onKey);

  // --- Render ------------------------------------------------------------------
  const render = () => {
    buffer.clear(theme.bg);
    if (opts.wallpaper) buffer.clip(area, () => opts.wallpaper!(buffer, area));

    const all = tuiWindows();
    let front: TuiWindow | null = null;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].visible) {
        front = all[i];
        break;
      }
    }
    buffer.clip(area, () => {
      for (const w of all) {
        w.active = w === front;
        if (w.visible) w.draw(buffer);
      }
      // The popup is not a window: it is painted over all of them, under the bar.
      if (settings?.visible) settings.draw(buffer);
    });
    menuBar.paint(buffer);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    // The canvas is rarely a whole number of cells. The strips past the last
    // column and (for a bottom bar) below the last row belong to the band: paint
    // them here, in pixel space, in the band's flattened ground (the band cells
    // get chromeBg over bg from the blit, so a translucent chromeBg still ends
    // up one even colour).
    const band = menuBar.pxRect();
    const cellsRight = buffer.cols * metrics.charW;
    const cellsBottom = buffer.rows * metrics.lineH;
    ctx.fillStyle = composite(theme.chromeBg, theme.bg);
    if (band.w > cellsRight) ctx.fillRect(cellsRight, band.y, band.w - cellsRight, band.h);
    const below = band.y + band.h - cellsBottom;
    if (below > 0) ctx.fillRect(band.x, cellsBottom, cellsRight, below);
    buffer.blit(ctx, metrics);
  };

  return {
    metrics,
    get buffer() {
      return buffer;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    ui,
    theme,
    menuBar,
    area,
    get windows() {
      return tuiWindows();
    },
    get settings() {
      return settings;
    },
    get dragging() {
      return popupCaptured || barCaptured || ui.dragging;
    },
    get activeFrame() {
      return activeFrame;
    },
    set activeFrame(v: boolean) {
      activeFrame = v;
    },
    setTheme,
    addWindow,
    removeWindow: (win) => ui.remove(win),
    toggleSettings,
    restoreAll,
    keyDown,
    resize,
    render,
    hitTest: target.hitTest!,
    pointerDown: (pt: Pt, mods?: PointerMods) => target.pointerDown(pt, mods),
    pointerMove: (pt: Pt, mods?: PointerMods) => target.pointerMove(pt, mods),
    pointerUp: (pt: Pt, mods?: PointerMods) => target.pointerUp(pt, mods),
    cursorAt: (pt: Pt) => target.cursorAt(pt),
    dispose: () => {
      disposePointer();
      if (hasDom) window.removeEventListener('keydown', onKey);
    },
  };
}
