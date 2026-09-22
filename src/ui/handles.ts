import type { Camera } from './camera';
import type { UIWindow } from './ui';
import { theme, type Cursor, type Pt } from './types';

export interface HandlesOptions {
  camera: Camera;
  /** Current world positions of the handles (read every event/draw). */
  points: () => Pt[];
  /** Called while dragging handle `index` with the pointer's world position. */
  onDrag: (index: number, world: Pt, screen: Pt) => void;
  /** Hit radius in screen px. */
  radius?: number;
  /** Optional painter; by default handles are invisible (the scene draws them). */
  draw?: (ctx: CanvasRenderingContext2D, screen: Pt, index: number, active: boolean) => void;
}

export interface Handles extends UIWindow {
  /** Index of the handle being dragged, or null. */
  readonly active: number | null;
  /** Screen positions of the handles right now. */
  screenPoints(): Pt[];
}

/**
 * Draggable world-space points. Lives in the UI manager below windows and the
 * loupe (`stayBehind`), so dragging a vertex never fights the chrome.
 */
export function createHandles({
  camera,
  points,
  onDrag,
  radius = 14,
  draw,
}: HandlesOptions): Handles {
  let active: number | null = null;

  const screenPoints = () => points().map((p) => camera.worldToScreen(p));
  const indexAt = (pt: Pt): number | null => {
    const sp = screenPoints();
    let best: number | null = null;
    let bestD = Infinity;
    sp.forEach((s, i) => {
      const d = Math.hypot(pt.x - s.x, pt.y - s.y);
      if (d <= radius && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };

  const handles: Handles = {
    visible: true,
    stayBehind: true,
    get active() {
      return active;
    },
    screenPoints,
    contains: (pt) => indexAt(pt) !== null,
    draw: (ctx) => {
      if (!draw) return;
      screenPoints().forEach((s, i) => draw(ctx, s, i, i === active));
    },
    pointerDown: (pt) => {
      active = indexAt(pt);
      return false;
    },
    pointerMove: (pt) => {
      if (active === null) return false;
      onDrag(active, camera.screenToWorld(pt), pt);
      return true;
    },
    pointerUp: () => {
      const was = active !== null;
      active = null;
      return was;
    },
    cursorAt: (pt): Cursor | null => {
      if (active !== null) return 'grabbing';
      return indexAt(pt) !== null ? 'grab' : null;
    },
  };
  return handles;
}

/** A ready-made node painter: paper disc with an ink outline. */
export const nodePainter =
  (r = 6) =>
  (ctx: CanvasRenderingContext2D, s: Pt, _i: number, active: boolean) => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, active ? r * 1.25 : r, 0, Math.PI * 2);
    ctx.fillStyle = theme.paper;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.ink;
    ctx.stroke();
  };
