import type { Camera } from './camera';
import { clientToLogical } from './pointer';
import type { Pt } from './types';

export interface CameraGestureOptions {
  getSize: () => [number, number];
  /** Return false to ignore a gesture that starts at `pt` (e.g. over a UI window). */
  shouldHandle?: (pt: Pt) => boolean;
  onChange?: () => void;
  /** Zoom sensitivity for ctrl+wheel / trackpad pinch. */
  wheelZoomSpeed?: number;
}

/**
 * Drive a camera from gestures: trackpad pinch (wheel with ctrlKey) zooms about
 * the cursor, plain wheel pans, and a two-finger touch pinch zooms/pans about
 * the midpoint. Returns a dispose function.
 */
export function attachCameraGestures(
  canvas: HTMLCanvasElement,
  camera: Camera,
  { getSize, shouldHandle = () => true, onChange, wheelZoomSpeed = 0.005 }: CameraGestureOptions,
): () => void {
  const touches = new Map<number, Pt>();
  let pinch: { dist: number; mid: Pt } | null = null;

  const onWheel = (e: WheelEvent) => {
    const pt = clientToLogical(canvas, e, getSize);
    if (!shouldHandle(pt)) return;
    e.preventDefault();
    // Trackpad pinch sends small deltas; a mouse notch sends ±100, so clamp per event
    const dz = Math.max(-100, Math.min(100, e.deltaY));
    const changed = e.ctrlKey
      ? camera.zoomBy(Math.exp(-dz * wheelZoomSpeed), pt)
      : camera.panBy(-e.deltaX, -e.deltaY);
    if (changed) onChange?.();
  };

  const pinchState = () => {
    const [a, b] = [...touches.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const pt = clientToLogical(canvas, e, getSize);
    if (touches.size === 0 && !shouldHandle(pt)) return;
    touches.set(e.pointerId, pt);
    pinch = touches.size === 2 ? pinchState() : null;
  };
  const onMove = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, clientToLogical(canvas, e, getSize));
    if (touches.size !== 2 || !pinch) return;
    const next = pinchState();
    let changed = false;
    if (pinch.dist > 0) changed = camera.zoomBy(next.dist / pinch.dist, next.mid) || changed;
    changed = camera.panBy(next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y) || changed;
    pinch = next;
    if (changed) onChange?.();
  };
  const onUp = (e: PointerEvent) => {
    if (!touches.delete(e.pointerId)) return;
    pinch = touches.size === 2 ? pinchState() : null;
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
  };
}
