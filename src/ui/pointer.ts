import type { Cursor, Pt } from './types';

export interface PointerTarget {
  pointerDown(pt: Pt): boolean;
  pointerMove(pt: Pt): boolean;
  pointerUp(pt: Pt): boolean;
  cursorAt(pt: Pt): Cursor | null;
}

export interface AttachPointerOptions {
  /** Called whenever a handler reports a change — e.g. `props.render`. */
  onChange?: () => void;
}

/**
 * Wire DOM pointer events on `canvas` to a logical-coordinate target.
 * `getSize` returns the sketch's logical [width, height] so the mapping stays
 * correct when the canvas is CSS-scaled or rendered at pixelRatio > 1.
 * Returns a dispose function.
 */
export function attachPointer(
  canvas: HTMLCanvasElement,
  target: PointerTarget,
  getSize: () => [number, number],
  { onChange }: AttachPointerOptions = {},
): () => void {
  const toLogical = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    const [w, h] = getSize();
    return {
      x: ((e.clientX - r.left) / r.width) * w,
      y: ((e.clientY - r.top) / r.height) * h,
    };
  };

  const updateCursor = (pt: Pt) => {
    canvas.style.cursor = target.cursorAt(pt) ?? 'default';
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toLogical(e);
    canvas.setPointerCapture?.(e.pointerId);
    if (target.pointerDown(pt)) onChange?.();
    updateCursor(pt);
  };
  const onMove = (e: PointerEvent) => {
    const pt = toLogical(e);
    if (target.pointerMove(pt)) onChange?.();
    updateCursor(pt);
  };
  const onUp = (e: PointerEvent) => {
    const pt = toLogical(e);
    if (target.pointerUp(pt)) onChange?.();
    updateCursor(pt);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.touchAction = 'none';

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.style.cursor = 'default';
  };
}
