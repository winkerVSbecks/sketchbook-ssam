import type { CellRect } from './cells';
import { cellRect, cellRectContains, intersectCellRect, isEmptyCellRect } from './cells';
import type { TuiMetrics } from './metrics';

export interface Glyph {
  ch: string;
  fg: string;
  /** Optional per-cell background painted as a rect under the glyph. */
  bg?: string;
}

export type BoxStyle = 'single' | 'double' | 'heavy' | 'round';

export interface BoxChars {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  h: string;
  v: string;
}

export const BOX: Record<BoxStyle, BoxChars> = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
};

/** Density ramp from the reference sketch (light → solid). */
export const SHADES = ['░', '▒', '▓', '█'] as const;

/** The slice of `CanvasRenderingContext2D` the blit needs (structural, for tests). */
export interface BlitContext {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export interface GlyphBuffer {
  readonly rows: number;
  readonly cols: number;
  /** `cells[row][col]`; `null` = empty (nothing blitted). */
  readonly cells: (Glyph | null)[][];
  /** Empty every cell (or fill with spaces on `bg` when given). Resets the clip stack. */
  clear(bg?: string): void;
  get(row: number, col: number): Glyph | null;
  /** Write one glyph; silently ignored outside the buffer or the current clip. */
  put(row: number, col: number, ch: string, fg: string, bg?: string): void;
  /**
   * Write `str` left-to-right from (row, col), one code point per cell,
   * truncated at `maxLen` and at the clip. Returns the number of cells written.
   */
  text(
    row: number,
    col: number,
    str: string,
    fg: string,
    bg?: string,
    maxLen?: number,
  ): number;
  hline(row: number, col: number, len: number, fg: string, bg?: string, ch?: string): void;
  vline(row: number, col: number, len: number, fg: string, bg?: string, ch?: string): void;
  /** Box-drawing frame on the perimeter of `rect` (1 cell thick). */
  box(rect: CellRect, style: BoxStyle, fg: string, bg?: string): void;
  fill(rect: CellRect, ch: string, fg: string, bg?: string): void;
  /** Run `fn` with writes restricted to `rect` ∩ the current clip. */
  clip(rect: CellRect, fn: () => void): void;
  /** The active clip (whole buffer when none is pushed). */
  clipRect(): CellRect;
  /** Paint the buffer: bg runs first, then one `fillText` per glyph. */
  blit(ctx: BlitContext, metrics: TuiMetrics, fallbackBg?: string): void;
}

/** Split into user-perceived characters (code points), so '█' and '│' are single cells. */
const chars = (s: string): string[] => Array.from(s);

export function createGlyphBuffer(rows: number, cols: number): GlyphBuffer {
  rows = Math.max(0, Math.floor(rows));
  cols = Math.max(0, Math.floor(cols));
  const bounds = cellRect(0, 0, rows, cols);
  const cells: (Glyph | null)[][] = Array.from({ length: rows }, () =>
    new Array<Glyph | null>(cols).fill(null),
  );
  const clips: CellRect[] = [];
  const clipRect = (): CellRect => clips[clips.length - 1] ?? bounds;

  const put = (row: number, col: number, ch: string, fg: string, bg?: string) => {
    if (!cellRectContains(clipRect(), row, col)) return;
    cells[row][col] = bg === undefined ? { ch, fg } : { ch, fg, bg };
  };

  const fill = (rect: CellRect, ch: string, fg: string, bg?: string) => {
    const r = intersectCellRect(rect, clipRect());
    if (isEmptyCellRect(r)) return;
    for (let row = r.row; row < r.row + r.rows; row++) {
      for (let col = r.col; col < r.col + r.cols; col++) {
        cells[row][col] = bg === undefined ? { ch, fg } : { ch, fg, bg };
      }
    }
  };

  const hline = (row: number, col: number, len: number, fg: string, bg?: string, ch = '─') => {
    for (let i = 0; i < len; i++) put(row, col + i, ch, fg, bg);
  };
  const vline = (row: number, col: number, len: number, fg: string, bg?: string, ch = '│') => {
    for (let i = 0; i < len; i++) put(row + i, col, ch, fg, bg);
  };

  return {
    rows,
    cols,
    cells,

    clear(bg) {
      clips.length = 0;
      for (let row = 0; row < rows; row++) {
        const line = cells[row];
        for (let col = 0; col < cols; col++) {
          line[col] = bg === undefined ? null : { ch: ' ', fg: bg, bg };
        }
      }
    },

    get: (row, col) =>
      cellRectContains(bounds, row, col) ? cells[row][col] : null,

    put,

    text(row, col, str, fg, bg, maxLen) {
      const glyphs = chars(str);
      const n = maxLen === undefined ? glyphs.length : Math.min(glyphs.length, Math.max(0, maxLen));
      const clip = clipRect();
      let written = 0;
      for (let i = 0; i < n; i++) {
        const c = col + i;
        if (!cellRectContains(clip, row, c)) continue;
        cells[row][c] = bg === undefined ? { ch: glyphs[i], fg } : { ch: glyphs[i], fg, bg };
        written++;
      }
      return written;
    },

    hline,
    vline,

    box(rect, style, fg, bg) {
      if (rect.rows < 1 || rect.cols < 1) return;
      const b = BOX[style];
      const top = rect.row;
      const bottom = rect.row + rect.rows - 1;
      const left = rect.col;
      const right = rect.col + rect.cols - 1;
      if (rect.rows === 1) {
        hline(top, left, rect.cols, fg, bg, b.h);
        return;
      }
      if (rect.cols === 1) {
        vline(top, left, rect.rows, fg, bg, b.v);
        return;
      }
      hline(top, left + 1, rect.cols - 2, fg, bg, b.h);
      hline(bottom, left + 1, rect.cols - 2, fg, bg, b.h);
      vline(top + 1, left, rect.rows - 2, fg, bg, b.v);
      vline(top + 1, right, rect.rows - 2, fg, bg, b.v);
      put(top, left, b.tl, fg, bg);
      put(top, right, b.tr, fg, bg);
      put(bottom, left, b.bl, fg, bg);
      put(bottom, right, b.br, fg, bg);
    },

    fill,

    clip(rect, fn) {
      clips.push(intersectCellRect(rect, clipRect()));
      try {
        fn();
      } finally {
        clips.pop();
      }
    },

    clipRect,

    blit(ctx, m, fallbackBg) {
      const { charW, lineH, baselineOffset } = m;
      if (fallbackBg !== undefined) {
        ctx.fillStyle = fallbackBg;
        ctx.fillRect(0, 0, cols * charW, rows * lineH);
      }
      // Backgrounds: merge horizontal runs of the same colour so fractional
      // charW doesn't leave antialiased seams between neighbouring cells.
      for (let row = 0; row < rows; row++) {
        const line = cells[row];
        let col = 0;
        while (col < cols) {
          const bg = line[col]?.bg;
          if (bg === undefined) {
            col++;
            continue;
          }
          let end = col + 1;
          while (end < cols && line[end]?.bg === bg) end++;
          ctx.fillStyle = bg;
          ctx.fillRect(col * charW, row * lineH, (end - col) * charW, lineH);
          col = end;
        }
      }
      // Glyphs sit on the alphabetic baseline at `baselineOffset`, which
      // `createMetrics` places so the reference glyph is centred in the row.
      ctx.font = m.font;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      for (let row = 0; row < rows; row++) {
        const line = cells[row];
        const y = row * lineH + baselineOffset;
        for (let col = 0; col < cols; col++) {
          const g = line[col];
          if (!g || g.ch === ' ' || g.ch === '') continue;
          ctx.fillStyle = g.fg;
          ctx.fillText(g.ch, col * charW, y);
        }
      }
    },
  };
}
