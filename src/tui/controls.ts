/**
 * Glyph controls for the terminal desktop: a momentary button, a toggle
 * group (checkboxes or radios) and a range slider, each laid out as whole
 * rows inside a window's inner rect. Everything here is pure cell maths —
 * pointer pixels are converted to cells by the caller (`metrics.toCell`).
 */
import type { Cursor } from '../ui';

import type { Cell, CellRect } from './cells';
import { cellRect, cellRectContains, intersectCellRect, isEmptyCellRect } from './cells';
import type { GlyphBuffer } from './grid';
import type { TuiTheme } from './theme';

/**
 * A control that owns a run of rows. Interaction handlers return `true` when
 * state changed (or the event was consumed) so the host can repaint.
 */
export interface TuiControl {
  readonly id: string;
  /** Rows the control needs for the given width. */
  rows(cols: number): number;
  /** Paint into `rect` (already laid out); `hot` = pointer is over the control. */
  draw(buf: GlyphBuffer, rect: CellRect, theme: TuiTheme, hot: boolean): void;
  pointerDown(cell: Cell, rect: CellRect): boolean;
  pointerMove(cell: Cell, rect: CellRect): boolean;
  pointerUp(cell: Cell, rect: CellRect): boolean;
  cursorAt(cell: Cell, rect: CellRect): Cursor | null;
}

/** What a `TuiWindow` forwards inner-rect pointer events to (cells are absolute). */
export interface TuiContentHandler {
  draw(buf: GlyphBuffer, inner: CellRect, theme: TuiTheme): void;
  pointerDown(cell: Cell, inner: CellRect): boolean;
  pointerMove(cell: Cell, inner: CellRect): boolean;
  pointerUp(cell: Cell, inner: CellRect): boolean;
  cursorAt(cell: Cell, inner: CellRect): Cursor | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Cells of a string (code points, so box/block glyphs count once). */
const width = (s: string): number => Array.from(s).length;

const inRect = (cell: Cell, rect: CellRect): boolean =>
  cellRectContains(rect, cell.row, cell.col);

// ─── Button ─────────────────────────────────────────────────────────────────

export interface ButtonOptions {
  id: string;
  label: string;
  onPress?: () => void;
}

export interface TuiButton extends TuiControl {
  /** True between a pointerDown inside and the matching pointerUp. */
  readonly pressed: boolean;
  label: string;
}

/** `[ Label ]` — reverse-video while pressed; `onPress` fires on release inside. */
export function createButton({ id, label, onPress }: ButtonOptions): TuiButton {
  let pressed = false;
  /** Pointer is currently inside while pressed (release outside cancels). */
  let inside = false;

  return {
    id,
    label,
    get pressed() {
      return pressed;
    },
    rows: () => 1,
    draw(buf, rect, theme, hot) {
      if (isEmptyCellRect(rect)) return;
      const text = `[ ${this.label} ]`;
      const active = pressed && inside;
      const fg = active ? theme.bg : hot ? theme.accent : theme.fg;
      const bg = active ? theme.fg : undefined;
      buf.text(rect.row, rect.col, text, fg, bg, rect.cols);
    },
    pointerDown(cell, rect) {
      if (!inRect(cell, rect)) return false;
      pressed = true;
      inside = true;
      return true;
    },
    pointerMove(cell, rect) {
      if (!pressed) return false;
      const now = inRect(cell, rect);
      if (now === inside) return false;
      inside = now;
      return true;
    },
    pointerUp(cell, rect) {
      if (!pressed) return false;
      pressed = false;
      const fire = inRect(cell, rect);
      inside = false;
      if (fire) onPress?.();
      return true;
    },
    cursorAt: (cell, rect) => (inRect(cell, rect) || pressed ? 'pointer' : null),
  };
}

// ─── Toggle group ───────────────────────────────────────────────────────────

export interface TuiToggleItem {
  id: string;
  label: string;
}

export interface ToggleGroupOptions {
  items: TuiToggleItem[];
  /** Radio semantics (`(●)`): exactly one active. Otherwise checkboxes (`[x]`). */
  exclusive?: boolean;
  active?: string | string[];
  onChange?: (active: string[]) => void;
}

export interface TuiToggleGroup extends TuiControl {
  readonly items: readonly TuiToggleItem[];
  /** Active ids in item order. */
  readonly active: string[];
  isActive(id: string): boolean;
  /** Returns true when the state changed. Exclusive groups ignore `on = false` for the active item. */
  setActive(id: string, on?: boolean): boolean;
}

/** One row per item: `[x] label` / `[ ] label`, or `(●) label` / `( ) label` when exclusive. */
export function createToggleGroup({
  items,
  exclusive = false,
  active,
  onChange,
}: ToggleGroupOptions): TuiToggleGroup {
  const ids = items.map((it) => it.id);
  const on = new Set<string>();
  const initial = active === undefined ? [] : Array.isArray(active) ? active : [active];
  for (const id of initial) if (ids.includes(id)) on.add(id);
  if (exclusive) {
    const first = ids.find((id) => on.has(id)) ?? ids[0];
    on.clear();
    if (first !== undefined) on.add(first);
  }

  const activeList = () => ids.filter((id) => on.has(id));

  const setActive = (id: string, next?: boolean): boolean => {
    if (!ids.includes(id)) return false;
    const want = next ?? !on.has(id);
    if (exclusive) {
      if (!want || on.has(id)) return false;
      on.clear();
      on.add(id);
    } else {
      if (want === on.has(id)) return false;
      if (want) on.add(id);
      else on.delete(id);
    }
    onChange?.(activeList());
    return true;
  };

  const itemAt = (cell: Cell, rect: CellRect): TuiToggleItem | null => {
    if (!inRect(cell, rect)) return null;
    return items[cell.row - rect.row] ?? null;
  };

  return {
    id: ids.join('|'),
    items,
    get active() {
      return activeList();
    },
    isActive: (id) => on.has(id),
    setActive,
    rows: () => items.length,
    draw(buf, rect, theme, hot) {
      if (isEmptyCellRect(rect)) return;
      items.forEach((it, i) => {
        if (i >= rect.rows) return;
        const isOn = on.has(it.id);
        const mark = exclusive ? (isOn ? '(●)' : '( )') : isOn ? '[x]' : '[ ]';
        const fg = isOn ? theme.accent : hot ? theme.fg : theme.dim;
        buf.text(rect.row + i, rect.col, `${mark} ${it.label}`, fg, undefined, rect.cols);
      });
    },
    pointerDown(cell, rect) {
      const it = itemAt(cell, rect);
      if (!it) return false;
      // Consume the press even if nothing changes (re-clicking the active radio).
      setActive(it.id);
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt: (cell, rect) => (itemAt(cell, rect) ? 'pointer' : null),
  };
}

// ─── Range ──────────────────────────────────────────────────────────────────

export interface RangeOptions {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  /** Value readout; default two decimals. Padded to a tabular width from `min`/`max`. */
  format?: (value: number) => string;
  /** Put label, track and value on a single row (default: label/value row above the track). */
  inline?: boolean;
  onChange?: (value: number) => void;
}

export interface TuiRange extends TuiControl {
  value: number;
  readonly dragging: boolean;
  /** Track geometry for the given rect: the row and the first/last cell of the `├…┤` run. */
  track(rect: CellRect): { row: number; col0: number; col1: number };
  /** Column of the `●` knob for the given rect. */
  knobCol(rect: CellRect): number;
}

const defaultFormat = (v: number): string => v.toFixed(2);

/**
 * `label` left and value right on the first row, `├────●────────┤` filling
 * the width on the second (or everything on one row when `inline`). The knob
 * drags and the track clicks; end caps snap to min/max.
 */
export function createRange({
  id,
  label,
  min,
  max,
  value,
  step = 0,
  format = defaultFormat,
  inline = false,
  onChange,
}: RangeOptions): TuiRange {
  const quantise = (v: number): number => {
    const c = clamp(v, min, max);
    if (!step) return c;
    const q = min + Math.round((c - min) / step) * step;
    return clamp(Number(q.toFixed(10)), min, max);
  };
  let current = quantise(value);
  let dragging = false;

  const valueWidth = Math.max(width(format(min)), width(format(max)));
  const readout = () => format(current).padStart(valueWidth, ' ');

  const track = (rect: CellRect) => {
    if (!inline) {
      return { row: rect.row + 1, col0: rect.col, col1: rect.col + rect.cols - 1 };
    }
    const left = label ? width(label) + 1 : 0;
    const right = valueWidth + 1;
    return { row: rect.row, col0: rect.col + left, col1: rect.col + rect.cols - 1 - right };
  };

  /** Cells the knob may occupy (between the end caps). */
  const span = (rect: CellRect) => {
    const t = track(rect);
    return { row: t.row, lo: t.col0 + 1, hi: t.col1 - 1 };
  };

  const knobCol = (rect: CellRect): number => {
    const s = span(rect);
    const n = s.hi - s.lo;
    if (n <= 0) return s.lo;
    const u = max === min ? 0 : (current - min) / (max - min);
    return s.lo + Math.round(clamp(u, 0, 1) * n);
  };

  const valueAt = (col: number, rect: CellRect): number => {
    const s = span(rect);
    const n = s.hi - s.lo;
    const u = n <= 0 ? 0 : clamp((col - s.lo) / n, 0, 1);
    return quantise(min + u * (max - min));
  };

  const set = (v: number): boolean => {
    const q = quantise(v);
    if (q === current) return false;
    current = q;
    onChange?.(current);
    return true;
  };

  const overTrack = (cell: Cell, rect: CellRect): boolean => {
    const t = track(rect);
    return cell.row === t.row && cell.col >= t.col0 && cell.col <= t.col1 && t.col1 > t.col0;
  };

  return {
    id,
    get value() {
      return current;
    },
    set value(v: number) {
      set(v);
    },
    get dragging() {
      return dragging;
    },
    track,
    knobCol,
    rows: () => (inline ? 1 : 2),
    draw(buf, rect, theme, hot) {
      if (isEmptyCellRect(rect)) return;
      const t = track(rect);
      const text = readout();
      if (inline) {
        if (label) buf.text(rect.row, rect.col, label, theme.fg, undefined, rect.cols);
        buf.text(rect.row, rect.col + rect.cols - width(text), text, theme.dim);
      } else {
        buf.text(rect.row, rect.col, label, theme.fg, undefined, Math.max(0, rect.cols - width(text) - 1));
        buf.text(rect.row, rect.col + rect.cols - width(text), text, theme.dim);
      }
      const len = t.col1 - t.col0 + 1;
      if (len < 2) return;
      const lineFg = hot || dragging ? theme.fg : theme.dim;
      buf.put(t.row, t.col0, '├', lineFg);
      buf.hline(t.row, t.col0 + 1, len - 2, lineFg);
      buf.put(t.row, t.col1, '┤', lineFg);
      if (len >= 3) buf.put(t.row, knobCol(rect), '●', theme.accent);
    },
    pointerDown(cell, rect) {
      if (!overTrack(cell, rect)) return false;
      dragging = true;
      set(valueAt(cell.col, rect));
      return true;
    },
    pointerMove(cell, rect) {
      if (!dragging) return false;
      return set(valueAt(cell.col, rect));
    },
    pointerUp(cell, rect) {
      if (!dragging) return false;
      dragging = false;
      set(valueAt(cell.col, rect));
      return true;
    },
    cursorAt(cell, rect) {
      if (dragging) return 'grabbing';
      if (!overTrack(cell, rect)) return null;
      return cell.col === knobCol(rect) ? 'grab' : 'pointer';
    },
  };
}

// ─── Layout + host ──────────────────────────────────────────────────────────

/** Breathing space between a window's inner rect and its controls, in cells. */
export interface LayoutPadding {
  rows?: number;
  cols?: number;
}

const resolvePadding = (p: number | LayoutPadding): { rows: number; cols: number } =>
  typeof p === 'number'
    ? { rows: Math.max(0, p), cols: Math.max(0, p) }
    : { rows: Math.max(0, p.rows ?? 0), cols: Math.max(0, p.cols ?? 0) };

/** `inner` shrunk by `padding` on every side (never negative). */
export function padInner(inner: CellRect, padding: number | LayoutPadding): CellRect {
  const p = resolvePadding(padding);
  return cellRect(
    inner.row + p.rows,
    inner.col + p.cols,
    Math.max(0, inner.rows - 2 * p.rows),
    Math.max(0, inner.cols - 2 * p.cols),
  );
}

/**
 * Stack controls top-to-bottom inside `inner` (inset by `padding`, default 0)
 * with one blank row between. Returns one rect per control (same order).
 * Controls that overflow are clipped to the remaining rows — an entirely
 * hidden control gets `rows: 0`.
 */
export function layoutControls(
  controls: readonly TuiControl[],
  inner: CellRect,
  padding: number | LayoutPadding = 0,
): CellRect[] {
  const content = padInner(inner, padding);
  const rects: CellRect[] = [];
  let row = content.row;
  const bottom = content.row + content.rows;
  for (const c of controls) {
    const want = Math.max(0, c.rows(content.cols));
    const rect = cellRect(row, content.col, want, content.cols);
    rects.push(intersectCellRect(rect, content));
    row += want + 1;
    if (row >= bottom) row = bottom;
  }
  return rects;
}

/**
 * Routes a window's inner-rect events to its controls: lays them out per call
 * (the inner rect can change with a resize) inset by `padding`, tracks hover
 * for `hot`, and captures the control that took `pointerDown` until `pointerUp`.
 */
export function createControlHost(
  controls: readonly TuiControl[],
  padding: number | LayoutPadding = 0,
): TuiContentHandler {
  let hot = -1;
  let captured = -1;

  const indexAt = (cell: Cell, rects: CellRect[]): number =>
    rects.findIndex((r) => !isEmptyCellRect(r) && inRect(cell, r));

  return {
    draw(buf, inner, theme) {
      const rects = layoutControls(controls, inner, padding);
      controls.forEach((c, i) => {
        const r = rects[i];
        if (isEmptyCellRect(r)) return;
        buf.clip(r, () => c.draw(buf, r, theme, i === hot || i === captured));
      });
    },
    pointerDown(cell, inner) {
      const rects = layoutControls(controls, inner, padding);
      const i = indexAt(cell, rects);
      if (i < 0) return false;
      captured = i;
      hot = i;
      return controls[i].pointerDown(cell, rects[i]);
    },
    pointerMove(cell, inner) {
      const rects = layoutControls(controls, inner, padding);
      if (captured >= 0) return controls[captured].pointerMove(cell, rects[captured]);
      const i = indexAt(cell, rects);
      const changed = i !== hot;
      hot = i;
      return changed;
    },
    pointerUp(cell, inner) {
      if (captured < 0) return false;
      const rects = layoutControls(controls, inner, padding);
      const i = captured;
      captured = -1;
      const changed = controls[i].pointerUp(cell, rects[i]);
      const now = indexAt(cell, rects);
      const hotChanged = now !== hot;
      hot = now;
      return changed || hotChanged;
    },
    cursorAt(cell, inner) {
      const rects = layoutControls(controls, inner, padding);
      if (captured >= 0) return controls[captured].cursorAt(cell, rects[captured]);
      const i = indexAt(cell, rects);
      return i < 0 ? null : controls[i].cursorAt(cell, rects[i]);
    },
  };
}
