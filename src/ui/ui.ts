import type { PointerTarget } from './pointer';
import type { Cursor, Pt } from './types';

/** The subset of a window the manager needs; `createWindow` satisfies it. */
export interface UIWindow extends PointerTarget {
  visible: boolean;
  /** Never brought to the front on pointerdown (e.g. a loupe that must stay under the windows). */
  stayBehind?: boolean;
  contains(pt: Pt): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface UI extends PointerTarget {
  windows: UIWindow[];
  /** Front-most visible window under `pt`, or null. */
  windowAt(pt: Pt): UIWindow | null;
  hitTest(pt: Pt): boolean;
  add(...windows: UIWindow[]): void;
  remove(win: UIWindow): void;
  bringToFront(win: UIWindow): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

/**
 * Holds windows in z-order (last = front). Draws back-to-front, dispatches
 * pointer events front-to-back (first hit wins) and captures the window that
 * took `pointerDown` until `pointerUp` so drags never leak to siblings.
 */
export function createUI(): UI {
  const windows: UIWindow[] = [];
  let captured: UIWindow | null = null;

  const hit = (pt: Pt): UIWindow | null => {
    for (let i = windows.length - 1; i >= 0; i--) {
      const w = windows[i];
      if (w.visible && w.contains(pt)) return w;
    }
    return null;
  };

  const bringToFront = (win: UIWindow) => {
    const i = windows.indexOf(win);
    if (i < 0 || i === windows.length - 1) return;
    windows.splice(i, 1);
    windows.push(win);
  };

  return {
    windows,
    add: (...ws) => {
      windows.push(...ws);
    },
    remove: (win) => {
      const i = windows.indexOf(win);
      if (i >= 0) windows.splice(i, 1);
      if (captured === win) captured = null;
    },
    bringToFront,
    windowAt: hit,
    hitTest: (pt) => hit(pt) !== null,
    draw: (ctx) => {
      for (const w of windows) if (w.visible) w.draw(ctx);
    },
    pointerDown: (pt, mods) => {
      const w = hit(pt);
      if (!w) return false;
      const wasBack = !w.stayBehind && windows[windows.length - 1] !== w;
      if (!w.stayBehind) bringToFront(w);
      captured = w;
      const changed = w.pointerDown(pt, mods);
      return changed || wasBack;
    },
    pointerMove: (pt, mods) => {
      if (captured) return captured.pointerMove(pt, mods);
      let changed = false;
      for (const w of windows) if (w.visible) changed = w.pointerMove(pt, mods) || changed;
      return changed;
    },
    pointerUp: (pt, mods) => {
      if (!captured) return false;
      const w = captured;
      captured = null;
      return w.pointerUp(pt, mods);
    },
    cursorAt: (pt): Cursor | null => {
      if (captured) return captured.cursorAt(pt);
      return hit(pt)?.cursorAt(pt) ?? null;
    },
  };
}
