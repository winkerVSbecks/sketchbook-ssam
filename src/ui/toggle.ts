import { drawFeather, feather } from './icons';
import {
  contains,
  drawCornerMarker,
  roundRectPath,
  theme,
  type Control,
  type Cursor,
  type Pt,
  type Rect,
} from './types';

export type IconPainter = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  active: boolean,
) => void;

export interface ToggleItem {
  id: string;
  drawIcon: IconPainter;
  tooltip?: string;
}

export interface ToggleGroupOptions {
  items: ToggleItem[];
  /** Button side length. */
  size?: number;
  gap?: number;
  direction?: 'column' | 'row';
  /** Radio semantics: exactly one active. Otherwise each toggles independently. */
  exclusive?: boolean;
  active?: string | string[];
  cornerMarker?: boolean;
  onChange?: (active: string[]) => void;
}

export interface ToggleGroup extends Control {
  readonly active: string[];
  isActive(id: string): boolean;
  setActive(id: string, on?: boolean): boolean;
}

export function createToggleGroup({
  items,
  size = 64,
  gap = 12,
  direction = 'column',
  exclusive = true,
  active,
  cornerMarker = true,
  onChange,
}: ToggleGroupOptions): ToggleGroup {
  const state = new Set<string>(
    active === undefined
      ? exclusive && items.length
        ? [items[0].id]
        : []
      : Array.isArray(active)
        ? active
        : [active],
  );
  let pressed: number | null = null;
  let hover: number | null = null;

  const itemRects = (rect: Rect): Rect[] =>
    items.map((_, i) =>
      direction === 'column'
        ? { x: rect.x, y: rect.y + i * (size + gap), w: size, h: size }
        : { x: rect.x + i * (size + gap), y: rect.y, w: size, h: size },
    );

  const indexAt = (pt: Pt, rect: Rect): number | null => {
    const rs = itemRects(rect);
    for (let i = 0; i < rs.length; i++) if (contains(rs[i], pt)) return i;
    return null;
  };

  const emit = () => onChange?.([...state]);

  const setActive = (id: string, on?: boolean): boolean => {
    const was = state.has(id);
    const want = on ?? !was;
    if (exclusive) {
      if (!want || was) return false; // radio: can't turn the only one off
      state.clear();
      state.add(id);
      emit();
      return true;
    }
    if (want === was) return false;
    if (want) state.add(id);
    else state.delete(id);
    emit();
    return true;
  };

  const group: ToggleGroup = {
    cell: false,
    get active() {
      return [...state];
    },
    isActive: (id) => state.has(id),
    setActive,
    measure: () =>
      direction === 'column'
        ? items.length * size + (items.length - 1) * gap
        : size,
    draw: (ctx, rect) => {
      const rs = itemRects(rect);
      ctx.save();
      items.forEach((item, i) => {
        const r = rs[i];
        const on = state.has(item.id);
        // Idle: paper. Hover: grey. Selected: inverted (ink fill, paper icon).
        roundRectPath(ctx, r, theme.radius + 2);
        ctx.fillStyle = on ? theme.ink : hover === i ? theme.fill : theme.paper;
        ctx.fill();
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = theme.border;
        ctx.stroke();
        const pad = size * 0.16;
        item.drawIcon(
          ctx,
          { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 },
          on,
        );
        if (cornerMarker) drawCornerMarker(ctx, r, 7, 4, on ? theme.paper : theme.ink);
      });
      ctx.restore();
    },
    pointerDown: (pt, rect) => {
      pressed = indexAt(pt, rect);
      return false;
    },
    pointerMove: (pt, rect) => {
      const next = indexAt(pt, rect);
      if (next === hover) return false;
      hover = next;
      return true;
    },
    pointerUp: (pt, rect) => {
      const i = indexAt(pt, rect);
      const p = pressed;
      pressed = null;
      if (i === null || i !== p) return false;
      return setActive(items[i].id);
    },
    cursorAt: (pt, rect): Cursor | null =>
      indexAt(pt, rect) !== null ? 'pointer' : null,
  };
  return group;
}

/** Icon painters matching the reference toolbar. */
/** Foreground/background for an icon given the button's selected state (selected is inverted). */
export const iconColors = (active: boolean) => ({
  fg: active ? theme.paper : theme.ink,
  bg: active ? theme.ink : theme.paper,
});

export const icons: Record<'dot' | 'ring' | 'line' | 'zoom', IconPainter> = {
  dot: (ctx, { x, y, w, h }, active) => {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = iconColors(active).fg;
    ctx.fill();
  },
  ring: (ctx, { x, y, w, h }, active) => {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = iconColors(active).fg;
    ctx.lineWidth = 1.75;
    ctx.stroke();
  },
  line: (ctx, { x, y, w, h }, active) => {
    const { fg, bg } = iconColors(active);
    const r = Math.min(w, h) * 0.09;
    const ax = x + r * 1.5;
    const ay = y + h - r * 1.5;
    const bx = x + w - r * 1.5;
    const by = y + r * 1.5;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = bg;
    for (const [px, py] of [
      [ax, ay],
      [bx, by],
    ]) {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  },
  zoom: (ctx, rect, active) => {
    drawFeather(ctx, rect, feather.zoomIn, iconColors(active).fg);
  },
};
