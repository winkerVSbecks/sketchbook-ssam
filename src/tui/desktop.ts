/**
 * The terminal desktop: the one call a sketch makes. Wires the glyph buffer,
 * metrics and theme to `createUI` (z-order + capture, reused from `src/ui`),
 * hosts `TuiWindow`s inside the desktop area, draws the system menu bar on the
 * bottom (or top) row and, when configured, a floating Settings window built
 * from glyph controls.
 *
 * Pointer events go to the bar first, then to the window manager; the bar is
 * painted last so nothing can cover it. `render()` clears the buffer, paints
 * wallpaper → windows (back-to-front) → bar, then blits once. Everything but
 * the blit is pure cell logic, so the desktop runs headless with a stub ctx.
 */
import { attachPointer, createUI } from '../ui';
import type { Cursor, PointerMods, PointerTarget, Pt, UI } from '../ui';

import { cellRect, type CellRect } from './cells';
import { createControlHost, type TuiControl } from './controls';
import { createGlyphBuffer, type BlitContext, type GlyphBuffer } from './grid';
import { createMenuBar, type MenuItem, type TuiMenuBar } from './menubar';
import { createMetrics, type TextMeasurer, type TuiMetrics } from './metrics';
import { fallbackTheme, themeFromPalette, type TuiTheme } from './theme';
import { createTuiWindow, type TuiWindow, type TuiWindowOptions } from './window';

/** What the desktop needs from a 2D context: glyph measuring + the blit. `CanvasRenderingContext2D` satisfies it. */
export type DesktopContext = BlitContext & TextMeasurer;

/** Per-window options a sketch supplies; metrics, bounds and theme are filled in by the desktop. */
export type DesktopWindowOptions = Omit<TuiWindowOptions, 'metrics' | 'bounds' | 'theme'> & {
  theme?: TuiTheme;
};

export interface DesktopSettingsOptions {
  /** Window title (default `settings`). */
  title?: string;
  controls: TuiControl[];
  /** Explicit geometry; by default the window is sized to its controls and placed top-right. */
  rect?: CellRect;
  /** Start visible (default false). */
  open?: boolean;
  /** Inner width in cells when sizing automatically (default 32). */
  cols?: number;
}

export interface DesktopOptions {
  ctx: DesktopContext;
  /** Omit for headless use (node tests): no pointer or keyboard listeners are attached. */
  canvas?: HTMLCanvasElement;
  width: number;
  height: number;
  /** Sketch palette (`palette[0]` = background) mapped through `themeFromPalette`… */
  palette?: readonly string[];
  /** …or a ready-made theme (wins over `palette`). */
  theme?: TuiTheme;
  font?: { size?: number; lineH?: number; family?: string; charW?: number };
  /** Where the system bar lives; the desktop area is the rest. Default `bottom` (taskbar-style). */
  menuBar?: 'top' | 'bottom';
  settings?: DesktopSettingsOptions;
  /** Right-aligned status text on the bar (seed, fps…). */
  status?: () => string;
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
  readonly buffer: GlyphBuffer;
  readonly ui: UI;
  readonly theme: TuiTheme;
  readonly menuBar: TuiMenuBar;
  /** Desktop area in cells: the whole buffer minus the bar row. */
  readonly area: CellRect;
  /** Sketch windows in z-order (back → front), excluding the settings window. */
  readonly windows: TuiWindow[];
  readonly settings: TuiWindow | null;
  /** True while the bar or a window holds the pointer. */
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
  /** Paint one frame: bg, wallpaper, windows back-to-front, bar; blit. */
  render(): void;
  dispose(): void;
}

const SETTINGS_ID = '≡ settings';
const DEFAULT_SETTINGS_COLS = 32;

export function createDesktop(opts: DesktopOptions): Desktop {
  const { ctx, width, height, onChange, onDragEnd } = opts;
  const theme: TuiTheme = opts.theme ?? (opts.palette ? themeFromPalette(opts.palette) : { ...fallbackTheme });
  const metrics = createMetrics(ctx, {
    fontSize: opts.font?.size,
    lineH: opts.font?.lineH,
    family: opts.font?.family ?? theme.font,
    charW: opts.font?.charW,
  });
  const rows = metrics.rows(height);
  const cols = metrics.cols(width);
  const buffer = createGlyphBuffer(rows, cols);

  const barSide = opts.menuBar ?? 'bottom';
  const barRow = barSide === 'bottom' ? rows - 1 : 0;
  const area: CellRect =
    barSide === 'bottom' ? cellRect(0, 0, Math.max(0, rows - 1), cols) : cellRect(1, 0, Math.max(0, rows - 1), cols);

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
    // Windows created while the settings window is open (re-layouts, rebuilds
    // triggered from it) slot in just below it, so it never gets buried.
    const settingsIdx = settings?.visible ? ui.windows.indexOf(settings) : -1;
    if (settingsIdx >= 0) ui.windows.splice(settingsIdx, 0, win);
    else ui.add(win);
    return win;
  };

  const raise = (win: TuiWindow) => {
    win.restore();
    ui.bringToFront(win);
  };

  // --- Settings window ---------------------------------------------------------
  let settings: TuiWindow | null = null;
  if (opts.settings) {
    const s = opts.settings;
    const host = createControlHost(s.controls);
    const rect = s.rect ?? settingsRect(s.controls, s.cols ?? DEFAULT_SETTINGS_COLS, area);
    settings = createTuiWindow({
      metrics,
      theme,
      title: s.title ?? 'settings',
      rect,
      bounds: area,
      minCols: Math.min(12, rect.cols),
      activeFrame: showActiveFrame,
      draw: (buf, inner) => host.draw(buf, inner, theme),
      content: host,
    });
    settings.visible = s.open ?? false;
    ui.add(settings);
  }

  const toggleSettings = () => {
    if (!settings) return;
    if (settings.visible) settings.visible = false;
    else raise(settings);
  };

  const restoreAll = () => {
    for (const w of tuiWindows()) if (w.minimized) w.restore();
  };

  // --- Menu bar ----------------------------------------------------------------
  const items = (): MenuItem[] => {
    const list: MenuItem[] = [];
    if (settings) {
      list.push({ id: SETTINGS_ID, label: SETTINGS_ID, active: settings.visible, onSelect: toggleSettings });
    }
    for (const w of tuiWindows()) {
      if (w.minimized) list.push({ id: idOf(w), label: w.title, onSelect: () => raise(w) });
    }
    return list;
  };
  const menuBar = createMenuBar({ metrics, theme, cols, row: barRow, items, status: opts.status });

  // --- Composed pointer target: bar first, then the window manager -------------
  let barCaptured = false;
  const target: PointerTarget = {
    hitTest: (pt) => menuBar.contains(pt) || ui.hitTest(pt),
    pointerDown(pt, mods) {
      if (menuBar.contains(pt)) {
        barCaptured = true;
        return menuBar.pointerDown(pt, mods);
      }
      return ui.pointerDown(pt, mods);
    },
    pointerMove(pt, mods) {
      if (barCaptured) return menuBar.pointerMove(pt, mods);
      return ui.pointerMove(pt, mods);
    },
    pointerUp(pt, mods) {
      if (barCaptured) {
        barCaptured = false;
        const changed = menuBar.pointerUp(pt, mods);
        onDragEnd?.();
        return changed;
      }
      return ui.pointerUp(pt, mods);
    },
    cursorAt(pt): Cursor | null {
      if (barCaptured || (!ui.dragging && menuBar.contains(pt))) return menuBar.cursorAt(pt);
      return ui.cursorAt(pt);
    },
  };

  // --- Input (browser only) ----------------------------------------------------
  const disposePointer = opts.canvas ? attachPointer(opts.canvas, target, size, { onChange }) : () => {};

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && settings?.visible) {
      settings.visible = false;
      onChange();
    }
    if (e.key === 'h') {
      restoreAll();
      onChange();
    }
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
    });
    menuBar.paint(buffer);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    buffer.blit(ctx, metrics, theme.bg);
  };

  return {
    metrics,
    buffer,
    ui,
    theme,
    menuBar,
    area,
    get windows() {
      return tuiWindows().filter((w) => w !== settings);
    },
    get settings() {
      return settings;
    },
    get dragging() {
      return barCaptured || ui.dragging;
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

/**
 * Size a settings window to its controls (stacked with one blank row between,
 * plus the 1-cell frame) and place it in the top-right corner of `area`.
 */
export function settingsRect(controls: readonly TuiControl[], innerCols: number, area: CellRect): CellRect {
  const innerRows = controls.reduce((sum, c, i) => sum + c.rows(innerCols) + (i > 0 ? 1 : 0), 0);
  const cols = Math.min(area.cols, innerCols + 2);
  const rows = Math.min(area.rows, innerRows + 2);
  return cellRect(area.row, area.col + area.cols - cols, rows, cols);
}
