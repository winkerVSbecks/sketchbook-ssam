import {
  clamp,
  contains,
  drawCornerMarker,
  labelFont,
  theme,
  type Control,
  type Cursor,
  type Pt,
  type Rect,
} from './types';

export interface RangeOptions {
  id?: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  knobColor?: string;
  knobRadius?: number;
  height?: number;
  /** Optional right-aligned readout; off by default to match the reference. */
  format?: (value: number) => string;
  cornerMarker?: boolean;
  onChange?: (value: number) => void;
}

export interface Range extends Control {
  readonly id: string;
  value: number;
  /** Track geometry for the given rect — exposed for tests. */
  track(rect: Rect): { x0: number; x1: number; y: number };
}

export function createRange({
  id,
  label,
  min,
  max,
  step = 0,
  value,
  knobColor = theme.ink,
  knobRadius = 14,
  height = 52,
  format,
  cornerMarker = true,
  onChange,
}: RangeOptions): Range {
  const quantise = (v: number) => {
    const c = clamp(v, min, max);
    if (!step) return c;
    const q = min + Math.round((c - min) / step) * step;
    return clamp(Number(q.toFixed(10)), min, max);
  };
  let current = quantise(value);
  let dragging = false;

  const track = (rect: Rect) => ({
    x0: rect.x + 6 + knobRadius,
    x1: rect.x + rect.w - 16 - knobRadius,
    y: rect.y + rect.h - knobRadius - 4,
  });

  const knobX = (rect: Rect) => {
    const t = track(rect);
    const u = max === min ? 0 : (current - min) / (max - min);
    return t.x0 + u * (t.x1 - t.x0);
  };

  const valueAt = (px: number, rect: Rect) => {
    const t = track(rect);
    const u = clamp((px - t.x0) / (t.x1 - t.x0), 0, 1);
    return quantise(min + u * (max - min));
  };

  const set = (v: number): boolean => {
    const q = quantise(v);
    if (q === current) return false;
    current = q;
    onChange?.(current);
    return true;
  };

  const overKnob = (pt: Pt, rect: Rect) => {
    const t = track(rect);
    const dx = pt.x - knobX(rect);
    const dy = pt.y - t.y;
    return dx * dx + dy * dy <= (knobRadius + 3) ** 2;
  };

  const overTrack = (pt: Pt, rect: Rect) => {
    const t = track(rect);
    return (
      pt.x >= t.x0 - knobRadius &&
      pt.x <= t.x1 + knobRadius &&
      Math.abs(pt.y - t.y) <= knobRadius + 3
    );
  };

  const range: Range = {
    id: id ?? label,
    get value() {
      return current;
    },
    set value(v: number) {
      set(v);
    },
    track,
    measure: () => height,
    draw: (ctx, rect) => {
      const t = track(rect);
      ctx.save();
      // Label
      ctx.font = labelFont(theme.labelSize, 500);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label.toUpperCase(), rect.x + 4, rect.y + 2);
      if (format) {
        ctx.textAlign = 'right';
        ctx.fillStyle = theme.pencil;
        ctx.fillText(format(current), rect.x + rect.w - 14, rect.y + 2);
      }
      // Track
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = theme.border;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y);
      ctx.lineTo(t.x1, t.y);
      ctx.stroke();
      // Knob
      ctx.beginPath();
      ctx.arc(knobX(rect), t.y, knobRadius, 0, Math.PI * 2);
      ctx.fillStyle = knobColor;
      ctx.fill();
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = theme.border;
      ctx.stroke();
      if (cornerMarker) drawCornerMarker(ctx, rect, 7, 2);
      ctx.restore();
    },
    pointerDown: (pt, rect) => {
      if (!contains(rect, pt)) return false;
      if (overKnob(pt, rect)) {
        dragging = true;
        return false;
      }
      if (overTrack(pt, rect)) {
        dragging = true;
        return set(valueAt(pt.x, rect));
      }
      return false;
    },
    pointerMove: (pt, rect) => {
      if (!dragging) return false;
      return set(valueAt(pt.x, rect));
    },
    pointerUp: () => {
      dragging = false;
      return false;
    },
    cursorAt: (pt, rect): Cursor | null => {
      if (dragging) return 'grabbing';
      if (overKnob(pt, rect)) return 'grab';
      if (overTrack(pt, rect)) return 'pointer';
      return null;
    },
  };
  return range;
}

export interface RangeGroupOptions {
  ranges: RangeOptions[];
  onChange?: (id: string, value: number) => void;
}

/** Build several ranges that share one `onChange(id, value)`; pass `.controls` as window children. */
export function createRangeGroup({ ranges, onChange }: RangeGroupOptions) {
  const controls = ranges.map((opts) => {
    const r = createRange({
      ...opts,
      onChange: (v) => {
        opts.onChange?.(v);
        onChange?.(opts.id ?? opts.label, v);
      },
    });
    return r;
  });
  const byId = new Map(controls.map((c) => [c.id, c]));
  return {
    controls,
    get: (id: string) => byId.get(id),
    value: (id: string) => byId.get(id)?.value ?? NaN,
    values: () =>
      Object.fromEntries(controls.map((c) => [c.id, c.value])) as Record<string, number>,
  };
}
