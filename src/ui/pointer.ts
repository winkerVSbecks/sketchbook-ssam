import type { Cursor, Pt } from './types';

export interface PointerMods {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface PointerTarget {
  /** Optional: whether `pt` is over the target at all (used to detect background clicks). */
  hitTest?(pt: Pt): boolean;
  pointerDown(pt: Pt, mods?: PointerMods): boolean;
  pointerMove(pt: Pt, mods?: PointerMods): boolean;
  pointerUp(pt: Pt, mods?: PointerMods): boolean;
  cursorAt(pt: Pt): Cursor | null;
}

export const modsOf = (e: MouseEvent): PointerMods => ({
  shiftKey: e.shiftKey,
  altKey: e.altKey,
  ctrlKey: e.ctrlKey,
  metaKey: e.metaKey,
});

export interface AttachPointerOptions {
  /** Called whenever a handler reports a change — e.g. `props.render`. */
  onChange?: () => void;
  /** Called on pointerdown when the target's `hitTest` says nothing was hit. Return true if you changed something. */
  onMiss?: (pt: Pt, event: PointerEvent) => boolean;
}

/** Map a DOM event's client position to logical sketch coordinates. */
export function clientToLogical(
  canvas: HTMLCanvasElement,
  e: { clientX: number; clientY: number },
  getSize: () => [number, number],
): Pt {
  const r = canvas.getBoundingClientRect();
  const [w, h] = getSize();
  return {
    x: ((e.clientX - r.left) / r.width) * w,
    y: ((e.clientY - r.top) / r.height) * h,
  };
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
  { onChange, onMiss }: AttachPointerOptions = {},
): () => void {
  const toLogical = (e: PointerEvent): Pt => clientToLogical(canvas, e, getSize);

  const updateCursor = (pt: Pt) => {
    canvas.style.cursor = target.cursorAt(pt) ?? 'default';
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toLogical(e);
    canvas.setPointerCapture?.(e.pointerId);
    const hit = target.hitTest ? target.hitTest(pt) : true;
    let changed = target.pointerDown(pt, modsOf(e));
    if (!hit && onMiss) changed = onMiss(pt, e) || changed;
    if (changed) onChange?.();
    updateCursor(pt);
  };
  const onMove = (e: PointerEvent) => {
    const pt = toLogical(e);
    if (target.pointerMove(pt, modsOf(e))) onChange?.();
    updateCursor(pt);
  };
  const onUp = (e: PointerEvent) => {
    const pt = toLogical(e);
    if (target.pointerUp(pt, modsOf(e))) onChange?.();
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
