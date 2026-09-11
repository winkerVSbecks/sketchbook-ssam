import { clamp, type Pt, type Rect } from './types';

export interface CameraOptions {
  /** Screen-space rect the camera looks through (the grid area). */
  viewport: Rect;
  /** World units spanned by the viewport width at zoom 1 (one unit = one base cell). */
  units: number;
  /** World x grows leftwards. */
  flipX?: boolean;
  /** World y grows upwards. */
  flipY?: boolean;
  minZoom?: number;
  maxZoom?: number;
}

export interface Camera {
  readonly viewport: Rect;
  readonly units: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Zoom relative to the fit view. */
  readonly zoom: number;
  /** Pixels per world unit at zoom 1. */
  readonly fitScale: number;
  /** Pixels per world unit now. */
  readonly scale: number;
  /** World point at the viewport centre. */
  readonly center: Pt;
  /** World point at the viewport centre in the fit view. */
  readonly fitCenter: Pt;
  worldToScreen(p: Pt): Pt;
  screenToWorld(p: Pt): Pt;
  /** Translate/scale `ctx` so subsequent drawing is in world units. Wrap in save/restore. */
  apply(ctx: CanvasRenderingContext2D): void;
  /** Multiply zoom by `factor`, keeping the world point under `anchor` (screen) fixed. Returns true if anything changed. */
  zoomBy(factor: number, anchor?: Pt): boolean;
  zoomTo(zoom: number, anchor?: Pt): boolean;
  /** Pan by a screen-space delta (content follows the pointer). */
  panBy(dx: number, dy: number): boolean;
  reset(): boolean;
  /** World rect currently visible through the viewport. */
  visibleWorld(): Rect;
}

export function createCamera({
  viewport,
  units,
  flipX = false,
  flipY = false,
  minZoom = 0.25,
  maxZoom = 8,
}: CameraOptions): Camera {
  const fitScale = viewport.w / units;
  const dirX = flipX ? -1 : 1;
  const dirY = flipY ? -1 : 1;
  const vcx = viewport.x + viewport.w / 2;
  const vcy = viewport.y + viewport.h / 2;
  const fitCenter: Pt = { x: units / 2, y: viewport.h / fitScale / 2 };

  let zoom = 1;
  const center: Pt = { ...fitCenter };
  const scale = () => fitScale * zoom;

  const worldToScreen = (p: Pt): Pt => ({
    x: vcx + dirX * (p.x - center.x) * scale(),
    y: vcy + dirY * (p.y - center.y) * scale(),
  });
  const screenToWorld = (p: Pt): Pt => ({
    x: center.x + (dirX * (p.x - vcx)) / scale(),
    y: center.y + (dirY * (p.y - vcy)) / scale(),
  });

  const zoomTo = (target: number, anchor: Pt = { x: vcx, y: vcy }): boolean => {
    const next = clamp(target, minZoom, maxZoom);
    if (next === zoom) return false;
    const anchorWorld = screenToWorld(anchor);
    zoom = next;
    // Re-centre so the anchored world point stays under the pointer
    const after = worldToScreen(anchorWorld);
    center.x += (dirX * (after.x - anchor.x)) / scale();
    center.y += (dirY * (after.y - anchor.y)) / scale();
    return true;
  };

  return {
    viewport,
    units,
    flipX,
    flipY,
    minZoom,
    maxZoom,
    fitScale,
    fitCenter,
    get zoom() {
      return zoom;
    },
    get scale() {
      return scale();
    },
    get center() {
      return { ...center };
    },
    worldToScreen,
    screenToWorld,
    apply: (ctx) => {
      ctx.translate(vcx, vcy);
      ctx.scale(dirX * scale(), dirY * scale());
      ctx.translate(-center.x, -center.y);
    },
    zoomBy: (factor, anchor) => zoomTo(zoom * factor, anchor),
    zoomTo,
    panBy: (dx, dy) => {
      if (dx === 0 && dy === 0) return false;
      center.x -= (dirX * dx) / scale();
      center.y -= (dirY * dy) / scale();
      return true;
    },
    reset: () => {
      const changed = zoom !== 1 || center.x !== fitCenter.x || center.y !== fitCenter.y;
      zoom = 1;
      center.x = fitCenter.x;
      center.y = fitCenter.y;
      return changed;
    },
    visibleWorld: () => {
      const a = screenToWorld({ x: viewport.x, y: viewport.y });
      const b = screenToWorld({ x: viewport.x + viewport.w, y: viewport.y + viewport.h });
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    },
  };
}
