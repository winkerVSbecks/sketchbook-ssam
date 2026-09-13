import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { randomPalette } from '__COLORS_IMPORT__';
import {
  cellRect,
  createButton,
  createDesktop,
  createRange,
  createToggleGroup,
  SHADES,
  type CellRect,
  type Desktop,
  type GlyphBuffer,
  type TuiControl,
  type TuiWindow,
} from '__TUI_IMPORT__';

/** Initial windows, in cells: `cellRect(row, col, rows, cols)` within the desktop area. */
const WINDOWS: { title: string; rect: CellRect }[] = __WINDOWS__;

export const sketch = ({ wrap, context, canvas, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      desktop.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = randomPalette();

  // Values the settings window edits; read them from `drawWindow`.
  const state = __STATE__;

  const controls: TuiControl[] = __CONTROLS__;

  // ---------------------------------------------------------------------------
  // Replace this: paint every window's body into `buf`, which is already
  // clipped to `inner` (the rect minus the frame). Switch on `win.title` to give
  // each window its own content; `win.rect` is the outer rect, `desktop.theme`
  // has the palette-derived colours (`fg`, `dim`, `accent`, `bg`…).
  // ---------------------------------------------------------------------------
  const drawWindow = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    switch (win.title) {
__CASES__
      default:
        placeholder(buf, inner, win);
    }
  };

  /** Optional: paint the desktop behind the windows (`area` excludes the bar). */
  const wallpaper = (buf: GlyphBuffer, area: CellRect) => {
    for (let r = area.row + 1; r < area.row + area.rows; r += 2) {
      for (let c = area.col + 2; c < area.col + area.cols; c += 4) buf.put(r, c, '·', desktop.theme.dim);
    }
  };

  /** Demo body: a density field that fills from the bottom as the first range rises. */
  const placeholder = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    const { fg, dim, accent } = desktop.theme;
    const level = __LEVEL_EXPR__;
    const filled = Math.round(level * Math.max(0, inner.rows - 1));
    for (let r = 0; r < inner.rows; r++) {
      const fromBottom = inner.rows - 1 - r;
      const ch = fromBottom < filled ? SHADES[Math.min(3, 1 + Math.floor((filled - fromBottom) / 3))] : SHADES[0];
      buf.hline(inner.row + r, inner.col, inner.cols, fromBottom < filled ? accent : dim, undefined, ch);
    }
    buf.text(inner.row, inner.col + 1, ` ${win.title} · ${inner.rows}×${inner.cols} `, fg, desktop.theme.bg);
  };

  // The desktop owns the glyph buffer, the windows (drag by title, double-click
  // the title to maximize, resize by the bottom-right grip, [–][□][×]), the
  // two-row menu bar (`+ new` + the `≡ settings` popup + minimized windows) and the
  // pointer/keyboard wiring: `Tab`/`Shift+Tab` cycle window focus, `Esc` hides
  // settings, `h` restores minimized windows. See src/tui/desktop.ts for every option.
  const desktop: Desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    palette,
    font: { size: __FONT_SIZE__, lineH: __FONT_LINE_H__ },
    menuBar: '__BAR__',
    settings: controls.length ? { controls } : undefined,
    status: () => '__NAME__',
    wallpaper,
    // `+ new` on the bar (left of `≡ settings`): add a window cascaded from the front one.
    onNewWindow: () => {
      const area = desktop.area;
      const front = desktop.windows[desktop.windows.length - 1];
      const rows = Math.min(12, area.rows);
      const cols = Math.min(32, area.cols);
      const row = Math.min(Math.max(front ? front.rect.row + 1 : area.row, area.row), Math.max(area.row, area.row + area.rows - rows));
      const col = Math.min(Math.max(front ? front.rect.col + 2 : area.col, area.col), Math.max(area.col, area.col + area.cols - cols));
      desktop.addWindow({
        title: `window ${String(desktop.windows.length + 1).padStart(2, '0')}`,
        rect: cellRect(row, col, rows, cols),
        minRows: 3,
        minCols: 8,
        draw: drawWindow,
        onClose: (win) => desktop.removeWindow(win),
      });
    },
    onChange: () => props.render(),
  });

  for (const w of WINDOWS) {
    desktop.addWindow({
      title: w.title,
      rect: w.rect,
      minRows: 3,
      minCols: 8,
      draw: drawWindow,
      onClose: (win) => desktop.removeWindow(win),
    });
  }

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      desktop,
      controls,
      state,
      repaint: () => props.render(),
    };
  }

  wrap.render = () => desktop.render();
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [__WIDTH__, __HEIGHT__],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
