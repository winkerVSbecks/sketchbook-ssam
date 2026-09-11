import { centredBox, drawFeather, feather } from './icons';
import type { UIWindow } from './ui';
import {
  contains,
  roundRectPath,
  theme,
  type Control,
  type Cursor,
  type Pt,
  type Rect,
} from './types';

export interface WindowOptions {
  x: number;
  y: number;
  width: number;
  children: Control[];
  padding?: number;
  gap?: number;
  collapsible?: boolean;
  closable?: boolean;
  draggable?: boolean;
  /** Draw a rounded cell around each child (the reference look). */
  cells?: boolean;
  visible?: boolean;
  onClose?: () => void;
}

export interface Window extends UIWindow {
  readonly rect: Rect;
  collapsed: boolean;
  show(): void;
  hide(): void;
  toggleCollapsed(): void;
}

type DragState =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'child'; index: number }
  | { kind: 'button'; which: 'close' | 'collapse' }
  | null;

export function createWindow({
  x,
  y,
  width,
  children,
  padding = 12,
  gap = 12,
  collapsible = true,
  closable = true,
  draggable = true,
  cells = true,
  visible = true,
  onClose,
}: WindowOptions): Window {
  const bar = theme.titleBarHeight;
  const framed = (c: Control) => cells && c.cell !== false;
  const padFor = (c: Control) => (framed(c) ? 6 : 0);
  const rect: Rect = { x, y, w: width, h: 0 };
  let drag: DragState = null;

  const childWidth = () => width - padding * 2;

  /** Layout children top-to-bottom; returns their rects (including cell padding). */
  const layout = (): Rect[] => {
    const rects: Rect[] = [];
    const cw = childWidth();
    let cy = rect.y + bar + padding;
    for (const c of children) {
      const cellPad = padFor(c);
      const h = c.measure(cw - cellPad * 2) + cellPad * 2;
      rects.push({ x: rect.x + padding, y: cy, w: cw, h });
      cy += h + gap;
    }
    return rects;
  };

  const bodyHeight = () => {
    if (children.length === 0) return 0;
    const cw = childWidth();
    let h = padding * 2 + gap * (children.length - 1);
    for (const c of children) {
      const cellPad = padFor(c);
      h += c.measure(cw - cellPad * 2) + cellPad * 2;
    }
    return h;
  };

  const win: Window = {
    rect,
    visible,
    collapsed: false,
    show: () => {
      win.visible = true;
    },
    hide: () => {
      win.visible = false;
      onClose?.();
    },
    toggleCollapsed: () => {
      win.collapsed = !win.collapsed;
    },
    contains: (pt) => contains(rect, pt),
    draw: (ctx) => draw(ctx),
    pointerDown: (pt) => pointerDown(pt),
    pointerMove: (pt) => pointerMove(pt),
    pointerUp: (pt) => pointerUp(pt),
    cursorAt: (pt) => cursorAt(pt),
  };

  const inner = (r: Rect, c: Control): Rect => {
    const cellPad = padFor(c);
    return { x: r.x + cellPad, y: r.y + cellPad, w: r.w - cellPad * 2, h: r.h - cellPad * 2 };
  };

  const titleRect = (): Rect => ({ x: rect.x, y: rect.y, w: rect.w, h: bar });
  const closeRect = (): Rect => ({ x: rect.x, y: rect.y, w: bar + 4, h: bar });
  const collapseRect = (): Rect => ({
    x: rect.x + rect.w - bar - 4,
    y: rect.y,
    w: bar + 4,
    h: bar,
  });

  const syncHeight = () => {
    rect.h = bar + (win.collapsed ? 0 : bodyHeight());
  };
  syncHeight();

  function draw(ctx: CanvasRenderingContext2D) {
    syncHeight();
    ctx.save();
    ctx.lineJoin = 'round';

    // Outer shell
    roundRectPath(ctx, rect, theme.radius);
    ctx.fillStyle = theme.paper;
    ctx.fill();

    // Title bar (square bottom edge when body is open)
    ctx.save();
    roundRectPath(ctx, rect, theme.radius);
    ctx.clip();
    ctx.fillStyle = theme.ink;
    ctx.fillRect(rect.x, rect.y, rect.w, bar);
    ctx.restore();

    // Feather icons, centred on the title bar's vertical midline (same in
    // open and collapsed state since the bar geometry never changes).
    const iconSize = Math.round(bar * 0.6);
    const cy = rect.y + bar / 2;
    if (closable) {
      const c = closeRect();
      drawFeather(ctx, centredBox(c.x + c.w / 2, cy, iconSize), feather.x, theme.paper);
    }
    if (collapsible) {
      const c = collapseRect();
      drawFeather(
        ctx,
        centredBox(c.x + c.w / 2, cy, iconSize),
        win.collapsed ? feather.chevronsDown : feather.chevronsRight,
        theme.paper,
      );
    }

    // Body
    if (!win.collapsed) {
      const rects = layout();
      children.forEach((child, i) => {
        const r = rects[i];
        if (framed(child)) {
          roundRectPath(ctx, r, theme.radius + 2);
          ctx.strokeStyle = theme.ink;
          ctx.lineWidth = theme.border;
          ctx.stroke();
        }
        child.draw(ctx, inner(r, child));
      });
    }

    // Border on top
    roundRectPath(ctx, rect, theme.radius);
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = theme.border;
    ctx.stroke();
    ctx.restore();
  }

  function childAt(pt: Pt): { index: number; rect: Rect } | null {
    if (win.collapsed) return null;
    const rects = layout();
    for (let i = 0; i < rects.length; i++) {
      if (contains(rects[i], pt)) return { index: i, rect: inner(rects[i], children[i]) };
    }
    return null;
  }

  function pointerDown(pt: Pt): boolean {
    if (!win.visible || !contains(rect, pt)) return false;
    if (closable && contains(closeRect(), pt)) {
      drag = { kind: 'button', which: 'close' };
      return false;
    }
    if (collapsible && contains(collapseRect(), pt)) {
      drag = { kind: 'button', which: 'collapse' };
      return false;
    }
    if (contains(titleRect(), pt)) {
      if (draggable) drag = { kind: 'move', dx: pt.x - rect.x, dy: pt.y - rect.y };
      return false;
    }
    const hit = childAt(pt);
    if (hit) {
      drag = { kind: 'child', index: hit.index };
      return children[hit.index].pointerDown(pt, hit.rect);
    }
    return false;
  }

  function pointerMove(pt: Pt): boolean {
    if (!win.visible) return false;
    if (!drag) {
      // Hover-only: every child sees the move so hover can clear when the pointer leaves
      if (win.collapsed) return false;
      const rects = layout();
      let changed = false;
      children.forEach((c, i) => {
        changed = c.pointerMove(pt, inner(rects[i], c)) || changed;
      });
      return changed;
    }
    if (drag.kind === 'move') {
      const nx = pt.x - drag.dx;
      const ny = pt.y - drag.dy;
      if (nx === rect.x && ny === rect.y) return false;
      rect.x = nx;
      rect.y = ny;
      return true;
    }
    if (drag.kind === 'child') {
      const r = inner(layout()[drag.index], children[drag.index]);
      return children[drag.index].pointerMove(pt, r);
    }
    return false;
  }

  function pointerUp(pt: Pt): boolean {
    if (!win.visible) return false;
    const d = drag;
    drag = null;
    if (!d) return false;
    if (d.kind === 'button') {
      if (d.which === 'close' && contains(closeRect(), pt)) {
        win.hide();
        return true;
      }
      if (d.which === 'collapse' && contains(collapseRect(), pt)) {
        win.toggleCollapsed();
        syncHeight();
        return true;
      }
      return false;
    }
    if (d.kind === 'child') {
      const r = inner(layout()[d.index], children[d.index]);
      return children[d.index].pointerUp(pt, r);
    }
    return false;
  }

  function cursorAt(pt: Pt): Cursor | null {
    if (!win.visible) return null;
    if (drag?.kind === 'move') return 'grabbing';
    if (drag?.kind === 'child') {
      return children[drag.index].cursorAt(pt, inner(layout()[drag.index], children[drag.index]));
    }
    if (!contains(rect, pt)) return null;
    if (closable && contains(closeRect(), pt)) return 'pointer';
    if (collapsible && contains(collapseRect(), pt)) return 'pointer';
    if (contains(titleRect(), pt)) return draggable ? 'grab' : 'default';
    const hit = childAt(pt);
    return hit ? children[hit.index].cursorAt(pt, hit.rect) ?? 'default' : 'default';
  }

  return win;
}
